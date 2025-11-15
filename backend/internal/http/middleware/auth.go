package middleware

import (
	"net/http"
	"strings"

	"github.com/example/phr-backend/internal/config"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// JWTAuth 解析 JWT token 并设置 userID 到 context
func JWTAuth(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		// 从 Authorization header 获取 token
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.Next()
			return
		}

		// 检查 Bearer 前缀
		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || parts[0] != "Bearer" {
			c.Next()
			return
		}

		tokenString := parts[1]

		// 解析 token
		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			// 验证签名方法
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, jwt.ErrSignatureInvalid
			}
			return []byte(cfg.Auth.JWTSecret), nil
		})

		if err != nil {
			c.Next()
			return
		}

		// 提取 claims
		if claims, ok := token.Claims.(jwt.MapClaims); ok && token.Valid {
			// 从 Subject (sub) claim 获取用户 ID
			if sub, ok := claims["sub"].(string); ok {
				if userID, err := uuid.Parse(sub); err == nil {
					c.Set("userID", userID)
				}
			}
		}

		c.Next()
	}
}

// RequireAuth 要求请求必须包含有效的认证信息
func RequireAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		// 检查是否有 userID（可能来自 JWT 或 X-User-ID header）
		if _, exists := c.Get("userID"); !exists {
			// 检查 X-User-ID header
			if header := c.GetHeader("X-User-ID"); header != "" {
				if id, err := uuid.Parse(header); err == nil {
					c.Set("userID", id)
					c.Next()
					return
				}
			}
			c.JSON(http.StatusUnauthorized, gin.H{"error": "未授权，请提供有效的用户信息"})
			c.Abort()
			return
		}
		c.Next()
	}
}
