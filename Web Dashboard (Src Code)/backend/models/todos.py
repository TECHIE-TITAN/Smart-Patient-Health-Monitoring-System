from pydantic import BaseModel
from typing import List, Optional

class Medication(BaseModel):
    name: str
    dosage: str
    frequency: str
    time: str
    notes: Optional[str] = None

class Todo(BaseModel):
    name: str
    phone_number: str
    unique_id: int
    age: int
    medications: Optional[List[Medication]] = []
    