import requests

CHANNEL_ID = "2895763"
READ_API_KEY = "MWFBV98HOZOHTHY4"

url = f"https://api.thingspeak.com/channels/{CHANNEL_ID}/feeds.json?api_key={READ_API_KEY}&results=1"

response = requests.get(url)
data = response.json()

# Now data['feeds'] will have only 1 item
if data['feeds']:
    latest_entry = data['feeds'][0]
    print(latest_entry)  # This will print only the latest data
else:
    print("No data found.")
