FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code and models
COPY . ./

EXPOSE 8001

ENV PORT=8001
ENV HOST=0.0.0.0
ENV USE_NEURAL_ENGINE=true

CMD ["python", "src/main.py"]
