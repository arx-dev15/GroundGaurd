FROM python:3.11-slim

WORKDIR /app

COPY services/ml/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY services/ml ./

EXPOSE 8001

CMD ["python", "src/main.py"]
