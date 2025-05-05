from fastapi import APIRouter, HTTPException
from models.todos import Todo, Medication
from config.database import collection_name
from schema.schemas import list_serial
from bson import ObjectId
import requests
from pymongo.errors import PyMongoError, OperationFailure, ConnectionFailure
from typing import List

router = APIRouter()

#Get request for all patients
@router.get("/")
async def get_todos():
    try:
        todos = list_serial(collection_name.find())
        return todos
    except PyMongoError as e:
        raise HTTPException(status_code=500, detail="Database error")

#Get request for single patient
@router.get("/patient/{patient_id}")
async def get_patient(patient_id: str):
    try:
        # First try to find by patient_id
        patient = collection_name.find_one({"unique_id": int(patient_id)})
        if patient is None:
            # If not found, try finding by _id
            patient = collection_name.find_one({"_id": ObjectId(patient_id)})
        
        if patient is None:
            raise HTTPException(status_code=404, detail="Patient not found")
        
        # Convert ObjectId to string
        patient['_id'] = str(patient['_id'])
        return patient
    
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid patient ID format")
    except ConnectionFailure:
        raise HTTPException(status_code=503, detail="Database connection error")
    except OperationFailure as e:
        raise HTTPException(status_code=500, detail=f"Database operation error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

#Post request
@router.post("/")
async def post_todo(todo: Todo):
    try:
        collection_name.insert_one(dict(todo))
    except PyMongoError as e:
        raise HTTPException(status_code=500, detail="Database error")

#Put Request
@router.put("/{id}")
async def put_todo(id: str, todo: Todo):
    try:
        result = collection_name.find_one_and_update(
            {"_id": ObjectId(id)}, 
            {"$set": dict(todo)}
        )
        if result is None:
            raise HTTPException(status_code=404, detail="Item not found")
    except PyMongoError as e:
        raise HTTPException(status_code=500, detail="Database error")

#delete request
@router.delete("/{id}")
async def delete_node(id: str):
    try:
        result = collection_name.find_one_and_delete({"_id": ObjectId(id)})
        if result is None:
            raise HTTPException(status_code=404, detail="Item not found")
    except PyMongoError as e:
        raise HTTPException(status_code=500, detail="Database error")

# Add medication to a patient
@router.post("/patient/{patient_id}/medications")
async def add_medication(patient_id: str, medication: Medication):
    try:
        # First try to find by patient_id
        patient = collection_name.find_one({"unique_id": int(patient_id)})
        if patient is None:
            # If not found, try finding by _id
            patient = collection_name.find_one({"_id": ObjectId(patient_id)})
        
        if patient is None:
            raise HTTPException(status_code=404, detail="Patient not found")
        
        # Update the medications list
        result = collection_name.update_one(
            {"_id": patient["_id"]},
            {"$push": {"medications": dict(medication)}}
        )
        
        if result.modified_count == 0:
            raise HTTPException(status_code=500, detail="Failed to add medication")
            
        # Get the updated patient
        updated_patient = collection_name.find_one({"_id": patient["_id"]})
        updated_patient["_id"] = str(updated_patient["_id"])
        
        return updated_patient
    
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid patient ID format")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

# Get all medications for a patient
@router.get("/patient/{patient_id}/medications")
async def get_medications(patient_id: str):
    try:
        # First try to find by patient_id
        patient = collection_name.find_one({"unique_id": int(patient_id)})
        if patient is None:
            # If not found, try finding by _id
            patient = collection_name.find_one({"_id": ObjectId(patient_id)})
        
        if patient is None:
            raise HTTPException(status_code=404, detail="Patient not found")
        
        return patient.get("medications", [])
    
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid patient ID format")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

# Delete a medication
@router.delete("/patient/{patient_id}/medications/{medication_index}")
async def delete_medication(patient_id: str, medication_index: int):
    try:
        # First try to find by patient_id
        patient = collection_name.find_one({"unique_id": int(patient_id)})
        if patient is None:
            # If not found, try finding by _id
            patient = collection_name.find_one({"_id": ObjectId(patient_id)})
        
        if patient is None:
            raise HTTPException(status_code=404, detail="Patient not found")
        
        # Check if medications exist
        medications = patient.get("medications", [])
        if medication_index >= len(medications) or medication_index < 0:
            raise HTTPException(status_code=404, detail="Medication not found")
        
        # Create an updated medications list excluding the one to delete
        updated_medications = [med for i, med in enumerate(medications) if i != medication_index]
        
        # Update the patient document
        result = collection_name.update_one(
            {"_id": patient["_id"]},
            {"$set": {"medications": updated_medications}}
        )
        
        if result.modified_count == 0:
            raise HTTPException(status_code=500, detail="Failed to delete medication")
            
        return {"status": "success", "message": f"Medication at index {medication_index} deleted"}
    
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid patient ID format")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

