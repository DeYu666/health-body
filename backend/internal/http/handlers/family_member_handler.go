package handlers

import (
	"errors"
	"net/http"

	"github.com/example/phr-backend/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type FamilyMemberHandler struct{ service service.FamilyMemberService }

func NewFamilyMemberHandler(service service.FamilyMemberService) *FamilyMemberHandler {
	return &FamilyMemberHandler{service: service}
}

func (h *FamilyMemberHandler) List(c *gin.Context) {
	userID, ok := requireUser(c)
	if !ok {
		return
	}
	members, err := h.service.List(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": members})
}

func (h *FamilyMemberHandler) Create(c *gin.Context) {
	userID, ok := requireUser(c)
	if !ok {
		return
	}
	var input service.FamilyMemberInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	member, err := h.service.Create(c.Request.Context(), userID, input)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, member)
}

func (h *FamilyMemberHandler) Update(c *gin.Context) {
	userID, ok := requireUser(c)
	if !ok {
		return
	}
	memberID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的成员 ID"})
		return
	}
	var input service.FamilyMemberInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	member, err := h.service.Update(c.Request.Context(), userID, memberID, input)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "家庭成员不存在"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, member)
}

func (h *FamilyMemberHandler) Delete(c *gin.Context) {
	userID, ok := requireUser(c)
	if !ok {
		return
	}
	memberID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的成员 ID"})
		return
	}
	err = h.service.Delete(c.Request.Context(), userID, memberID)
	if errors.Is(err, service.ErrCannotDeleteSelf) {
		c.JSON(http.StatusConflict, gin.H{"error": "不能删除本人档案"})
		return
	}
	if errors.Is(err, service.ErrMemberHasRecords) {
		c.JSON(http.StatusConflict, gin.H{"error": "该成员已有健康资料，不能删除"})
		return
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "家庭成员不存在"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}
