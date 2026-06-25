# Exim Operation System - Api Specification

API Specification

Project

Exim Operation System

Scope

This API Specification covers Phase 1: Import Operation for the Exim Operation System. The focus is on import transaction monitoring, status tracking, document versioning, and operational processing by Exim team users.

1. Purpose

This document defines the backend API contract for the Exim Operation System so frontend, backend, QA, and integration teams can work from the same specification.

Objectives: - Standardize request and response structures - Define main resources and endpoints - Support import transaction lifecycle management - Support document upload and document versioning - Support transaction timeline / status history - Prepare APIs for scalable future enhancement

2. General Standards

2.1 Base URL

/api/v1

2.2 Authentication

Authentication is required for protected endpoints.

Method: Bearer Token / JWT

Header:

Authorization: Bearer <token>

2.3 Content Type

Content-Type: application/json

For file upload:

Content-Type: multipart/form-data

2.4 Common Response Format

Success Response

{
  "success": true,
  "message": "Request processed successfully",
  "data": {},
  "meta": {}
}

Error Response

{
  "success": false,
  "message": "Validation error",
  "errors": [
    {
      "field": "po_number",
      "message": "PO Number is required"
    }
  ]
}

2.5 Standard HTTP Status Codes

200 OK — successful retrieval/update

201 Created — successful creation

400 Bad Request — invalid request

401 Unauthorized — missing/invalid authentication

403 Forbidden — no permission

404 Not Found — resource not found

409 Conflict — duplicate or invalid state transition

500 Internal Server Error — unexpected server error

3. Main Resources

Authentication

Users

Master Data

Import Transactions

Transaction Status / Timeline

Transaction Documents

Document Versions

Notes / Remarks

Dashboard / Summary

4. Business Workflow Status

The import transaction status flow is:

INITIATE_SHIPPING_DOCUMENT

BIDDING_TRANSPORTER

TRANSPORT_CONFIRMED

READY_PICKUP

PICKED_UP

ON_SHIPMENT

CUSTOMS_CLEARANCE

DELIVERED

4.1 Status Transition Rule

A transaction can only move to the next allowed status unless overridden by authorized admin logic.

5. API Endpoints

5.1 Authentication

5.1.1 Login

POST /auth/login

Security Note

The frontend will send email and password to the backend over HTTPS.

Password visibility in browser DevTools request payload is normal for web applications and cannot be fully hidden from the end user.

The system must not store passwords in plain text.

Passwords must be hashed on the server using a strong one-way hashing algorithm such as bcrypt or Argon2 before being stored in the database.

After successful authentication, the API returns an access token so the password is not sent again on subsequent requests.

Request

{
  "email": "exim.user@company.com",
  "password": "user-input-password"
}

Backend Processing Rule

1. Receive email and password over HTTPS
2. Find user by email
3. Compare provided password with stored hashed password
4. If valid, generate access token
5. Return authenticated user profile and token

Example Stored Password in Database

$2b$10$9QWmH6lW0wzY0JkP3Yp9V.U1nT7x9v0mO2dF8sKpL3nQeR5tY7u8a

Response

{
  "success": true,
  "message": "Login successful",
  "data": {
    "access_token": "jwt-token",
    "refresh_token": "refresh-token-value",
    "token_type": "Bearer",
    "expires_in": 3600,
    "user": {
      "id": "usr_001",
      "name": "Alex Tan",
      "email": "exim.user@company.com",
      "role": "IMPORT_OFFICER"
    }
  }
}

5.1.2 Refresh Access Token

POST /auth/refresh

Description

Issue a new access token using a valid refresh token.

Request

{
  "refresh_token": "refresh-token-value"
}

Backend Processing Rule

1. Receive refresh token
2. Validate token signature and expiration
3. Check token status is active and not revoked
4. Issue new access token
5. Optionally rotate refresh token based on security policy

Response

{
  "success": true,
  "message": "Token refreshed successfully",
  "data": {
    "access_token": "new-jwt-token",
    "token_type": "Bearer",
    "expires_in": 3600,
    "refresh_token": "new-refresh-token-value"
  }
}

5.1.3 Logout

POST /auth/logout

Description

Invalidate the current authenticated session token and revoke refresh token.

Request

{
  "refresh_token": "refresh-token-value"
}

Response

{
  "success": true,
  "message": "Logout successful"
}

5.1.4 Get Current User

GET /auth/me

Response

{
  "success": true,
  "data": {
    "id": "usr_001",
    "name": "Alex Tan",
    "email": "exim.user@company.com",
    "role": "IMPORT_OFFICER"
  }
}

5.2 Users

5.2.1 List Users

GET /users

Query Parameters

page

limit

search

role

status

Response

{
  "success": true,
  "data": [
    {
      "id": "usr_001",
      "name": "Alex Tan",
      "email": "exim.user@company.com",
      "role": "IMPORT_OFFICER",
      "is_active": true
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 1
  }
}

5.3 Master Data

5.3.1 List Vendors / Suppliers

GET /master/vendors

5.3.2 List Transporters

GET /master/transporters

5.3.3 List Ports

GET /master/ports

5.3.4 List Incoterms

GET /master/incoterms

5.3.5 List Countries

GET /master/countries

Standard Response Example

{
  "success": true,
  "data": [
    {
      "id": "port_001",
      "code": "IDJKT",
      "name": "Jakarta Port"
    }
  ]
}

5.4 Import Transactions

5.4.1 Create Import Transaction

POST /import-transactions

Description

Create a new import transaction when Exim team starts monitoring an overseas purchase.

Request

{
  "po_number": "PO-2026-0001",
  "purchase_request_number": "PR-2026-0008",
  "item_name": "Industrial Pump",
  "item_category": "Machinery",
  "supplier_name": "Global Parts Ltd",
  "supplier_country": "China",
  "incoterm": "FOB",
  "currency": "USD",
  "estimated_value": 25000,
  "origin_port_code": "CNSHA",
  "origin_port_name": "Shanghai Port",
  "destination_port_code": "IDJKT",
  "destination_port_name": "Jakarta Port",
  "eta": "2026-04-15",
  "remarks": "Urgent shipment"
}

Response

{
  "success": true,
  "message": "Import transaction created successfully",
  "data": {
    "id": "imp_001",
    "transaction_number": "IMP-2026-0001",
    "po_number": "PO-2026-0001",
    "current_status": "INITIATE_SHIPPING_DOCUMENT",
    "created_at": "2026-03-12T08:00:00Z"
  }
}

5.4.2 List Import Transactions

GET /import-transactions

Query Parameters

page

limit

search

status

supplier_name

po_number

from_date

to_date

Response

{
  "success": true,
  "data": [
    {
      "id": "imp_001",
      "transaction_number": "IMP-2026-0001",
      "po_number": "PO-2026-0001",
      "supplier_name": "Global Parts Ltd",
      "origin_port_name": "Shanghai Port",
      "destination_port_name": "Jakarta Port",
      "current_status": "ON_SHIPMENT",
      "eta": "2026-04-15"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 1
  }
}

5.4.3 Get Import Transaction Detail

GET /import-transactions/{id}

Response

{
  "success": true,
  "data": {
    "id": "imp_001",
    "transaction_number": "IMP-2026-0001",
    "po_number": "PO-2026-0001",
    "purchase_request_number": "PR-2026-0008",
    "item_name": "Industrial Pump",
    "item_category": "Machinery",
    "supplier_name": "Global Parts Ltd",
    "supplier_country": "China",
    "incoterm": "FOB",
    "currency": "USD",
    "estimated_value": 25000,
    "origin_port_code": "CNSHA",
    "origin_port_name": "Shanghai Port",
    "destination_port_code": "IDJKT",
    "destination_port_name": "Jakarta Port",
    "eta": "2026-04-15",
    "current_status": "ON_SHIPMENT",
    "created_at": "2026-03-12T08:00:00Z",
    "updated_at": "2026-03-15T10:00:00Z"
  }
}

5.4.4 Update Import Transaction

PUT /import-transactions/{id}

Request

{
  "eta": "2026-04-20",
  "remarks": "ETA updated from vendor"
}

Response

{
  "success": true,
  "message": "Import transaction updated successfully",
  "data": {
    "id": "imp_001"
  }
}

5.4.5 Cancel / Close Import Transaction

PATCH /import-transactions/{id}/close

Request

{
  "reason": "Shipment cancelled by supplier"
}

5.5 Transaction Status / Timeline

5.5.1 Update Transaction Status

POST /import-transactions/{id}/status

Description

Move transaction to next operational status and record timeline history.

Request

{
  "new_status": "CUSTOMS_CLEARANCE",
  "remarks": "Documents submitted to customs"
}

Response

{
  "success": true,
  "message": "Transaction status updated successfully",
  "data": {
    "transaction_id": "imp_001",
    "previous_status": "ON_SHIPMENT",
    "current_status": "CUSTOMS_CLEARANCE",
    "updated_at": "2026-03-20T09:00:00Z"
  }
}

5.5.2 Get Transaction Timeline

GET /import-transactions/{id}/timeline

Response

{
  "success": true,
  "data": [
    {
      "sequence": 1,
      "status": "INITIATE_SHIPPING_DOCUMENT",
      "changed_at": "2026-03-12T08:00:00Z",
      "changed_by": "Alex Tan",
      "remarks": "Transaction initiated"
    },
    {
      "sequence": 2,
      "status": "BIDDING_TRANSPORTER",
      "changed_at": "2026-03-13T09:00:00Z",
      "changed_by": "Alex Tan",
      "remarks": "Bidding started"
    }
  ]
}

5.5.3 Get Current and Previous Status Summary

GET /import-transactions/{id}/status-summary

Response

{
  "success": true,
  "data": {
    "current_status": "ON_SHIPMENT",
    "previous_status": "PICKED_UP",
    "last_updated_at": "2026-03-18T11:20:00Z"
  }
}

5.6 Transaction Documents

5.6.1 Upload Document

POST /import-transactions/{id}/documents

Content Type

multipart/form-data

Form Data

document_type (string)

document_name (string)

version_label (string, example: DRAFT, FINAL)

remarks (string, optional)

file (binary)

Response

{
  "success": true,
  "message": "Document uploaded successfully",
  "data": {
    "document_id": "doc_001",
    "document_name": "Bill of Lading",
    "document_type": "BL",
    "current_version": 1,
    "version_label": "DRAFT",
    "file_name": "bill_of_lading_v1.pdf"
  }
}

5.6.2 List Transaction Documents

GET /import-transactions/{id}/documents

Response

{
  "success": true,
  "data": [
    {
      "document_id": "doc_001",
      "document_name": "Bill of Lading",
      "document_type": "BL",
      "latest_version_number": 2,
      "latest_version_label": "FINAL",
      "uploaded_at": "2026-03-15T10:00:00Z"
    }
  ]
}

5.6.3 Get Document Detail

GET /documents/{document_id}

Response

{
  "success": true,
  "data": {
    "document_id": "doc_001",
    "transaction_id": "imp_001",
    "document_name": "Bill of Lading",
    "document_type": "BL",
    "latest_version_number": 2,
    "latest_version_label": "FINAL"
  }
}

5.6.4 Download Latest Document

GET /documents/{document_id}/download

Response

Binary file stream

5.6.5 Soft Delete Document

DELETE /documents/{document_id}

Response

{
  "success": true,
  "message": "Document deleted successfully"
}

5.7 Document Versions

5.7.1 Upload New Version of Existing Document

POST /documents/{document_id}/versions

Content Type

multipart/form-data

Form Data

version_label (string: DRAFT or FINAL)

remarks (string, optional)

file (binary)

Response

{
  "success": true,
  "message": "New document version uploaded successfully",
  "data": {
    "document_id": "doc_001",
    "version_number": 2,
    "version_label": "FINAL",
    "file_name": "bill_of_lading_v2.pdf"
  }
}

5.7.2 List Document Versions

GET /documents/{document_id}/versions

Response

{
  "success": true,
  "data": [
    {
      "version_number": 1,
      "version_label": "DRAFT",
      "file_name": "bill_of_lading_v1.pdf",
      "uploaded_by": "Alex Tan",
      "uploaded_at": "2026-03-14T08:00:00Z"
    },
    {
      "version_number": 2,
      "version_label": "FINAL",
      "file_name": "bill_of_lading_v2.pdf",
      "uploaded_by": "Alex Tan",
      "uploaded_at": "2026-03-15T10:00:00Z"
    }
  ]
}

5.7.3 Get Specific Version Detail

GET /documents/{document_id}/versions/{version_number}

5.7.4 Download Specific Version

GET /documents/{document_id}/versions/{version_number}/download

5.8 Notes / Remarks

5.8.1 Add Transaction Note

POST /import-transactions/{id}/notes

Request

{
  "note": "Vendor confirmed revised ETA"
}

Response

{
  "success": true,
  "message": "Note added successfully",
  "data": {
    "note_id": "note_001"
  }
}

5.8.2 List Transaction Notes

GET /import-transactions/{id}/notes

5.9 Dashboard / Summary

5.9.1 Import Dashboard Summary

GET /dashboard/import-summary

Response

{
  "success": true,
  "data": {
    "total_transactions": 120,
    "in_progress": 90,
    "delivered": 25,
    "delayed": 5
  }
}

5.9.2 Transaction Count by Status

GET /dashboard/import-status-summary

Response

{
  "success": true,
  "data": [
    {
      "status": "INITIATE_SHIPPING_DOCUMENT",
      "count": 10
    },
    {
      "status": "ON_SHIPMENT",
      "count": 35
    }
  ]
}

5.10 Password Security

5.10.1 Password Storage Rules

Password must never be stored in plain text

Password must be hashed using bcrypt or Argon2

Password hash operation must occur on backend server only

Frontend must never hash password as a replacement for backend password hashing

5.10.2 Authentication Recommendations

Enforce HTTPS in all environments except controlled local development

Apply rate limiting on login endpoint

Lock or temporarily suspend login after repeated failed attempts based on security policy

Log authentication attempts for audit purposes

Use short-lived access tokens and longer-lived refresh tokens

Revoke refresh token during logout

Support refresh token rotation for better session security

5.10.3 Login Rate Limiting and Failed Attempt Policy

Recommended initial security policy: - Maximum 5 failed login attempts within 15 minutes per account and per IP - On threshold breach, temporarily lock login for 15 minutes - Continue logging blocked attempts for audit review - Admin should be able to unlock account manually if needed in future enhancement

Suggested Error Response for Rate Limit

{
  "success": false,
  "message": "Too many failed login attempts. Please try again later."
}

5.10.4 Token Policy

Access token lifetime: 15 to 60 minutes

Refresh token lifetime: 7 to 30 days depending on company security policy

Refresh token should be stored securely and revocable

Refresh token should be uniquely tracked per session/device if session management is implemented

6. Validation Rules

6.0 Authentication

email is required and must be valid email format

password is required for login

refresh_token is required for refresh and logout endpoints

refresh token must be valid, active, and not revoked

6.1 Import Transaction

po_number is required

supplier_name is required

origin_port_code is required

destination_port_code is required

eta must be a valid date

estimated_value must be numeric and greater than or equal to 0

6.2 Status Update

new_status is required

status transition must follow allowed workflow

6.3 Document Upload

document_type is required

document_name is required

version_label is required

uploaded file size and extension must comply with system rules

7. Access Control Matrix

8. Future Enhancement API Candidates

These are not included in current phase but should be considered later: - Export transaction APIs - Approval workflow APIs - Notification APIs - SLA / escalation APIs - Integration APIs with ERP / SAP - Audit trail reporting APIs - Device/session management APIs - SSO / corporate identity provider integration

9. Recommendation for Development

For implementation in Node.js + PostgreSQL + Next.js, the next engineering step should be:

Convert this API specification into Swagger / OpenAPI

Generate route modules by resource

Define request DTO and response schema

Implement RBAC middleware

Implement validation middleware

Implement file upload abstraction for future storage flexibility

10. Suggested Resource-Based Backend Module Structure

backend/src/modules/
  auth/
  users/
  master-data/
  import-transactions/
  transaction-status/
  documents/
  document-versions/
  notes/
  dashboard/

11. Assumptions

This document focuses on Import Phase only

Export phase will be specified separately

Document file storage physical design may evolve later

Status history must be preserved for audit and tracking purposes

Document versions must not overwrite previous files

Role | View Transactions | Create Transaction | Update Transaction | Update Status | Upload Document | Manage Users

Admin | Yes | Yes | Yes | Yes | Yes | Yes

Import Officer | Yes | Yes | Yes | Yes | Yes | No

Viewer | Yes | No | No | No | No | No

