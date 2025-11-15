package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const DemoUserID = "11111111-1111-1111-1111-111111111111"

func userIDFromRequest(c *gin.Context) (uuid.UUID, bool) {
	if header := c.GetHeader("X-User-ID"); header != "" {
		if id, err := uuid.Parse(header); err == nil {
			return id, true
		}
	}
	if claim, exists := c.Get("userID"); exists {
		if id, ok := claim.(uuid.UUID); ok {
			return id, true
		}
		if str, ok := claim.(string); ok {
			if parsed, err := uuid.Parse(str); err == nil {
				return parsed, true
			}
		}
	}
	id, err := uuid.Parse(DemoUserID)
	if err != nil {
		return uuid.Nil, false
	}
	return id, false
}

func requireUser(ctx *gin.Context) (uuid.UUID, bool) {
	userID, ok := userIDFromRequest(ctx)
	if !ok || userID == uuid.Nil {
		ctx.JSON(http.StatusUnauthorized, gin.H{"error": "未授权，请提供有效的用户信息"})
		return uuid.Nil, false
	}
	return userID, true
}
