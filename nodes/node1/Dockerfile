FROM python:3.10-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files and tasks
COPY . .

EXPOSE 8001

CMD ["uvicorn", "nodes.node1.worker:app", "--host", "0.0.0.0", "--port", "8001"]
