"""Structured logging utilities with counters."""

import logging
import json
import time
from typing import Dict, Any, Optional
from datetime import datetime
from collections import defaultdict, Counter
from app.config import settings

class StructuredFormatter(logging.Formatter):
    """JSON formatter for structured logging."""
    
    def format(self, record):
        log_entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno
        }
        
        # Add extra fields if present
        if hasattr(record, 'extra_fields'):
            log_entry.update(record.extra_fields)
        
        return json.dumps(log_entry)

class MetricsCounter:
    """Counter for tracking API metrics and performance."""
    
    def __init__(self):
        self.counters = defaultdict(int)
        self.timers = {}
        self.start_time = time.time()
    
    def increment(self, metric: str, value: int = 1):
        """Increment a counter metric."""
        self.counters[metric] += value
    
    def start_timer(self, operation: str):
        """Start timing an operation."""
        self.timers[operation] = time.time()
    
    def end_timer(self, operation: str) -> float:
        """End timing an operation and return duration."""
        if operation in self.timers:
            duration = time.time() - self.timers[operation]
            del self.timers[operation]
            self.increment(f"{operation}_duration_ms", int(duration * 1000))
            return duration
        return 0.0
    
    def get_metrics(self) -> Dict[str, Any]:
        """Get all metrics."""
        uptime = time.time() - self.start_time
        return {
            "counters": dict(self.counters),
            "uptime_seconds": uptime,
            "active_timers": len(self.timers)
        }
    
    def reset(self):
        """Reset all metrics."""
        self.counters.clear()
        self.timers.clear()
        self.start_time = time.time()

# Global metrics counter
metrics = MetricsCounter()

def get_logger(name: str) -> logging.Logger:
    """Get a logger with structured formatting."""
    logger = logging.getLogger(name)
    
    if not logger.handlers:
        # Create handler
        handler = logging.StreamHandler()
        
        # Set formatter based on config
        if settings.log_format == "json":
            formatter = StructuredFormatter()
        else:
            formatter = logging.Formatter(
                '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
            )
        
        handler.setFormatter(formatter)
        logger.addHandler(handler)
        logger.setLevel(getattr(logging, settings.log_level.upper()))
    
    return logger

def log_with_metrics(logger: logging.Logger, level: str, message: str, **extra_fields):
    """Log with additional metrics and extra fields."""
    extra_fields['metrics'] = metrics.get_metrics()
    extra_fields['counters'] = dict(metrics.counters)
    
    getattr(logger, level.lower())(message, extra={'extra_fields': extra_fields})

def track_api_call(operation: str):
    """Decorator to track API calls."""
    def decorator(func):
        def wrapper(*args, **kwargs):
            metrics.start_timer(operation)
            metrics.increment(f"{operation}_calls")
            
            try:
                result = func(*args, **kwargs)
                metrics.increment(f"{operation}_success")
                return result
            except Exception as e:
                metrics.increment(f"{operation}_errors")
                raise
            finally:
                metrics.end_timer(operation)
        
        return wrapper
    return decorator
