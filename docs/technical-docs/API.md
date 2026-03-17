# 9Tools Document Management API Documentation

## Base URL
```
Production: https://9tools.upz.in.th/api
Development: http://localhost:3000/api
```

## Authentication

### Bearer Token
All API requests (except authentication endpoints) require a Bearer token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

### Token Refresh
Access tokens expire after 1 hour. Use the refresh token to get a new access token.

## Endpoints

### Authentication

#### POST /auth/login
Login with email and password.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "rememberMe": false
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "first_name": "John",
      "last_name": "Doe",
      "role": "user"
    },
    "token": "jwt-access-token",
    "refreshToken": "jwt-refresh-token",
    "expiresIn": 3600
  }
}
```

#### POST /auth/register
Register a new user.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "first_name": "John",
  "last_name": "Doe",
  "department": "IT",
  "position": "Developer"
}
```

#### POST /auth/google
Login with Google OAuth.

**Request Query:**
- `code`: Google authorization code

#### POST /auth/refresh
Refresh access token.

**Request Body:**
```json
{
  "refreshToken": "jwt-refresh-token"
}
```

#### POST /auth/logout
Logout user.

**Headers:**
- `Authorization: Bearer <token>`

#### POST /auth/forgot-password
Request password reset.

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

#### POST /auth/reset-password
Reset password with token.

**Request Body:**
```json
{
  "token": "reset-token",
  "newPassword": "new-password123"
}
```

### Users

#### GET /users
Get all users (Admin only).

**Query Parameters:**
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20)
- `search`: Search term
- `role`: Filter by role
- `isActive`: Filter by active status

**Response:**
```json
{
  "success": true,
  "data": {
    "users": [...],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 100,
      "totalPages": 5
    }
  }
}
```

#### GET /users/:id
Get user by ID.

#### PUT /users/:id
Update user (Admin or self).

**Request Body:**
```json
{
  "first_name": "John",
  "last_name": "Doe",
  "department": "IT",
  "position": "Senior Developer"
}
```

#### DELETE /users/:id
Delete user (Admin only).

#### POST /users/:id/enable-2fa
Enable 2FA for user.

#### POST /users/:id/disable-2fa
Disable 2FA for user.

### Folders

#### GET /folders
Get folders with optional filtering.

**Query Parameters:**
- `parentId`: Parent folder ID (null for root)
- `search`: Search term
- `page`: Page number
- `limit`: Items per page

#### POST /folders
Create new folder.

**Request Body:**
```json
{
  "name": "Documents",
  "description": "Main documents folder",
  "parentId": null,
  "permissions": {
    "admin": ["read", "write", "delete"],
    "manager": ["read", "write"],
    "user": ["read"]
  },
  "isPublic": false
}
```

#### GET /folders/:id
Get folder by ID.

#### PUT /folders/:id
Update folder.

#### DELETE /folders/:id
Delete folder (and all contents).

### Documents

#### GET /documents
Get documents with filtering.

**Query Parameters:**
- `folderId`: Filter by folder
- `search`: Search term
- `documentType`: Filter by type
- `tags`: Filter by tags (comma-separated)
- `dateFrom`: Filter by date from
- `dateTo`: Filter by date to
- `page`: Page number
- `limit`: Items per page
- `sortBy`: Sort field
- `sortOrder`: Sort order (asc/desc)

#### POST /documents/upload
Upload document.

**Request:** `multipart/form-data`
- `file`: File to upload
- `folderId`: Target folder ID
- `description`: Document description
- `tags`: Tags (JSON array)
- `category`: Document category
- `documentType`: Document type
- `documentDate`: Document date
- `expiryDate`: Expiry date
- `isPublic`: Public access flag

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "document-uuid",
    "filename": "document.pdf",
    "originalFilename": "original.pdf",
    "mimeType": "application/pdf",
    "fileSize": 1024000,
    "uploadDate": "2024-01-01T00:00:00Z"
  }
}
```

#### GET /documents/search
Advanced document search.

**Request Body:**
```json
{
  "query": "search term",
  "filters": {
    "folderId": "uuid",
    "documentType": "invoice",
    "tags": ["important", "2024"],
    "dateFrom": "2024-01-01",
    "dateTo": "2024-12-31",
    "uploadedBy": "user-uuid"
  },
  "pagination": {
    "page": 1,
    "limit": 20
  }
}
```

#### GET /documents/:id
Get document by ID.

#### GET /documents/:id/download
Download document.

#### PUT /documents/:id
Update document metadata.

#### DELETE /documents/:id
Delete document.

### Audit Trails

#### GET /audit
Get audit trails.

**Query Parameters:**
- `userId`: Filter by user
- `action`: Filter by action
- `resourceType`: Filter by resource type
- `dateFrom`: Filter by date from
- `dateTo`: Filter by date to
- `page`: Page number
- `limit`: Items per page

#### GET /audit/stats
Get audit statistics.

**Response:**
```json
{
  "success": true,
  "data": {
    "totalActions": 1000,
    "actionsByType": {
      "login": 500,
      "upload": 200,
      "download": 300
    },
    "actionsByDate": [
      {
        "date": "2024-01-01",
        "count": 50
      }
    ],
    "topUsers": [
      {
        "userId": "uuid",
        "name": "John Doe",
        "actionCount": 100
      }
    ]
  }
}
```

### Notifications

#### GET /notifications
Get user notifications.

**Query Parameters:**
- `unreadOnly`: Get only unread notifications
- `type`: Filter by type
- `category`: Filter by category
- `page`: Page number
- `limit`: Items per page

#### PUT /notifications/:id/read
Mark notification as read.

#### DELETE /notifications/:id
Delete notification.

## Error Responses

All endpoints return consistent error responses:

```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {
    "field": "validation error"
  }
}
```

### Common Error Codes

- `UNAUTHORIZED` (401): Authentication required
- `FORBIDDEN` (403): Insufficient permissions
- `NOT_FOUND` (404): Resource not found
- `VALIDATION_ERROR` (400): Invalid input data
- `FILE_TOO_LARGE` (413): File exceeds size limit
- `RATE_LIMIT_EXCEEDED` (429): Too many requests
- `INTERNAL_ERROR` (500): Server error

## Rate Limiting

- General API: 100 requests per 15 minutes per IP
- Upload endpoints: 10 requests per 15 minutes per user
- Authentication endpoints: 5 requests per minute per IP

## File Upload Limits

- Maximum file size: 100MB (configurable)
- Supported formats: PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, JPG, PNG, GIF, TIFF
- Chunked upload supported for files > 10MB

## Webhooks

### Document Events

Configure webhooks to receive notifications about document events:

#### POST /webhooks/document-uploaded
Triggered when a document is uploaded.

#### POST /webhooks/document-downloaded
Triggered when a document is downloaded.

#### POST /webhooks/document-deleted
Triggered when a document is deleted.

**Webhook Payload:**
```json
{
  "event": "document.uploaded",
  "timestamp": "2024-01-01T00:00:00Z",
  "data": {
    "document": {
      "id": "uuid",
      "filename": "document.pdf",
      "uploadedBy": "user-uuid"
    },
    "user": {
      "id": "uuid",
      "email": "user@example.com"
    }
  }
}
```

## SDK Examples

### JavaScript/Node.js

```javascript
const axios = require('axios');

const api = axios.create({
  baseURL: 'https://9tools.upz.in.th/api',
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

// Upload document
const uploadDocument = async (file, folderId) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('folderId', folderId);
  
  const response = await api.post('/documents/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  });
  
  return response.data;
};

// Search documents
const searchDocuments = async (query) => {
  const response = await api.get('/documents/search', {
    params: { query }
  });
  
  return response.data;
};
```

### Python

```python
import requests

class DocumentAPI:
    def __init__(self, base_url, token):
        self.base_url = base_url
        self.headers = {'Authorization': f'Bearer {token}'}
    
    def upload_document(self, file_path, folder_id):
        with open(file_path, 'rb') as f:
            files = {'file': f}
            data = {'folderId': folder_id}
            
            response = requests.post(
                f'{self.base_url}/documents/upload',
                files=files,
                data=data,
                headers=self.headers
            )
        
        return response.json()
    
    def search_documents(self, query):
        response = requests.get(
            f'{self.base_url}/documents/search',
            params={'query': query},
            headers=self.headers
        )
        
        return response.json()
```

## Testing

### Postman Collection
Import the provided Postman collection to test all endpoints.

### Environment Variables
- `BASE_URL`: API base URL
- `TOKEN`: JWT access token
- `REFRESH_TOKEN`: JWT refresh token

---

For more information, contact the development team at dev@9tools.upz.in.th
