# GitHub Organization + Team Management API

This document describes the new organization and team management endpoints added to the backend API.

## Configuration

To enable organization and team management features, you need to set the following environment variables:

### Required Environment Variables

1. **GITHUB_ORG**: The name of your GitHub organization
   ```bash
   GITHUB_ORG=your-organization-name
   ```

2. **GITHUB_TOKEN**: A GitHub personal access token or GitHub App installation token with `admin:org` scope
   ```bash
   GITHUB_TOKEN=your-org-admin-token-with-admin-org-scope
   ```

### Setting up the GitHub Token

The organization admin should provide a GitHub personal access token with the following scopes:
- `admin:org` - Required for organization and team management
- `read:org` - Required for reading organization information

#### Creating a Personal Access Token:
1. Go to GitHub Settings > Developer settings > Personal access tokens
2. Click "Generate new token (classic)"
3. Select the `admin:org` scope
4. Copy the generated token and set it as the `GITHUB_TOKEN` environment variable

**Security Note**: Never hardcode the token in your source code. Always use environment variables or a secure secret store.

## API Endpoints

All organization management endpoints require:
- `Authorization` header with the organization admin token
- Proper environment variables (`GITHUB_ORG` and `GITHUB_TOKEN`)

### Organization Management

#### GET /api/github/org/members
Returns all members of the organization.

**Example:**
```bash
curl -X GET http://localhost:5000/api/github/org/members \
  -H "Authorization: your-org-admin-token"
```

#### PUT /api/github/org/members/:username
Invites a user to the organization.

**Example:**
```bash
curl -X PUT http://localhost:5000/api/github/org/members/john-doe \
  -H "Authorization: your-org-admin-token"
```

#### DELETE /api/github/org/members/:username
Removes a user from the organization.

**Example:**
```bash
curl -X DELETE http://localhost:5000/api/github/org/members/john-doe \
  -H "Authorization: your-org-admin-token"
```

### Team Management

#### GET /api/github/org/teams
Lists all teams in the organization.

**Example:**
```bash
curl -X GET http://localhost:5000/api/github/org/teams \
  -H "Authorization: your-org-admin-token"
```

#### GET /api/github/org/teams/:team_slug/members
Lists all members of a specific team.

**Example:**
```bash
curl -X GET http://localhost:5000/api/github/org/teams/developers/members \
  -H "Authorization: your-org-admin-token"
```

#### PUT /api/github/org/teams/:team_slug/members/:username
Adds a user to a team.

**Example:**
```bash
curl -X PUT http://localhost:5000/api/github/org/teams/developers/members/john-doe \
  -H "Authorization: your-org-admin-token"
```

#### DELETE /api/github/org/teams/:team_slug/members/:username
Removes a user from a team.

**Example:**
```bash
curl -X DELETE http://localhost:5000/api/github/org/teams/developers/members/john-doe \
  -H "Authorization: your-org-admin-token"
```

#### POST /api/github/org/teams/:from_team_slug/move/:to_team_slug/:username
Moves a user from one team to another.

**Example:**
```bash
curl -X POST http://localhost:5000/api/github/org/teams/developers/move/maintainers/john-doe \
  -H "Authorization: your-org-admin-token"
```

## Error Handling

The API handles various error scenarios:

- **401 Unauthorized**: Missing or invalid authorization token
- **400 Bad Request**: Missing required parameters
- **404 Not Found**: User, team, or organization not found
- **500 Internal Server Error**: Missing environment variables or unexpected errors

All endpoints return JSON responses with error details:

```json
{
  "error": "Error Type",
  "message": "Detailed error message"
}
```

## Security Considerations

1. **Token Security**: The organization admin token has powerful permissions. Store it securely and never expose it in logs or client-side code.

2. **Environment Variables**: Use secure methods to provide environment variables in production (e.g., Docker secrets, Kubernetes secrets, CI/CD secret management).

3. **Access Control**: These endpoints are protected by token validation but consider adding additional access control layers based on your security requirements.

4. **Logging**: The API logs safe metadata only and never exposes the token in logs.

## Integration with Existing API

These new endpoints follow the same patterns as existing GitHub API routes:
- Same validation middleware structure
- Same error handling patterns
- Same response formats
- Integrated with existing Swagger documentation

The endpoints are added to the existing `/api/github/` router and use the same authentication patterns as other GitHub API endpoints in the application.