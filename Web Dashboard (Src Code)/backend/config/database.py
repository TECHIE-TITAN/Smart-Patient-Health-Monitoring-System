from pymongo import MongoClient

client = MongoClient("mongodb+srv://dbUser:TvNv9619@cluster0.7zvwp.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0")

db = client.todo

collection_name = db["patient"]