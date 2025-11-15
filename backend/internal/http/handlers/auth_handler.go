package handlers

import (
	"net/http"

	"github.com/example/phr-backend/internal/service"
	"github.com/gin-gonic/gin"
)

type AuthHandler struct {
	authService service.AuthService
}

func NewAuthHandler(authService service.AuthService) *AuthHandler {
	return &AuthHandler{authService: authService}
}

type loginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

type registerRequest struct {
	Email       string `json:"email" binding:"required,email"`
	Password    string `json:"password" binding:"required,min=6"`
	DisplayName string `json:"displayName" binding:"required"`
}

type pinLoginRequest struct {
	Email string `json:"email" binding:"required,email"`
	Pin   string `json:"pin" binding:"required,len=6"`
}

func (h *AuthHandler) Register(c *gin.Context) {
	var req registerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	token, err := h.authService.Register(c.Request.Context(), req.Email, req.Password, req.DisplayName)
	if err != nil {
		status := http.StatusInternalServerError
		if err == service.ErrUserAlreadyExists {
			status = http.StatusConflict
			c.JSON(status, gin.H{"error": "该邮箱已被注册"})
			return
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, token)
}

func (h *AuthHandler) Login(c *gin.Context) {
	var req loginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	token, err := h.authService.Authenticate(c.Request.Context(), req.Email, req.Password)
	if err != nil {
		status := http.StatusUnauthorized
		if err == service.ErrInvalidCredentials {
			c.JSON(status, gin.H{"error": "邮箱或密码错误"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, token)
}

func (h *AuthHandler) PinLogin(c *gin.Context) {
	var req pinLoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	token, err := h.authService.VerifyPin(c.Request.Context(), req.Email, req.Pin)
	if err != nil {
		switch err {
		case service.ErrPinNotEnabled:
			c.JSON(http.StatusForbidden, gin.H{"error": "该账号未启用 PIN 登录"})
			return
		case service.ErrInvalidCredentials:
			c.JSON(http.StatusUnauthorized, gin.H{"error": "PIN 码错误"})
			return
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}

	c.JSON(http.StatusOK, token)
}
