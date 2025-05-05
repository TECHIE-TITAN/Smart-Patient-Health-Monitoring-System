from pydantic import BaseModel
from typing import Optional

class Patient(BaseModel):
    name: str
    phone_number: str
    patient_id: str
    age: str
    status: str = "normal"