def individual_serial(todo) -> dict:
    return {
        "id": str(todo["_id"]),
        "name": todo["name"],
        "phone_number": todo["phone_number"],
        "unique_id": todo["unique_id"],
        "age": todo["age"],
        "medications": todo.get("medications", [])
    }

def list_serial(todos) -> list:
    return [individual_serial(todo) for todo in todos]