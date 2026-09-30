"""
GroundGuard Query Router (src/rag/router.py)
Determines whether query activates dense, lexical, and graph retrieval branches.
"""

from typing import List, Optional
from pydantic import BaseModel, Field

from src.pipeline.router import route_query, RouteDecision

__all__ = ["route_query", "RouteDecision"]
