from transformers import pipeline

classifier = pipeline('sentiment-analysis', model='nlptown/bert-base-multilingual-uncased-sentiment')

# result = classifier("goodluck")
# print("Score: "+str(int(result[0]['label'][0])))

# result = classifier("i hate you")
# print("Score: "+str(int(result[0]['label'][0])))

# result = classifier("give up")
# print("Score: "+str(int(result[0]['label'][0])))

from fastapi import FastAPI
from fastapi import Request
app = FastAPI()

@app.post("/sentiment")
async def sentiment(request: Request):
    try:
        data = await request.json()
    except Exception:
        return {"error": "Invalid or missing JSON in request body"}
    content = data.get("content", "")
    if not content:
        return {"error": "Missing 'content' field in JSON."}
    result = classifier(content)
    score = int(result[0]['label'][0])
    return {"score": score}

# uvicorn message_sentiment:app --reload --port 3001