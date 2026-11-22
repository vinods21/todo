# API Changelog 1 vs. 1


## API Changes

### GET /api/tasks
- :warning: removed the required property `items/items/dueDate` from the response with the `200` status


### POST /api/tasks
- :warning: removed the required property `dueDate` from the response with the `201` status


### GET /api/tasks/{id}
- :warning: removed the required property `dueDate` from the response with the `200` status


### PUT /api/tasks/{id}
- :warning: removed the required property `dueDate` from the response with the `200` status


### PATCH /api/tasks/{id}/status
- :warning: removed the required property `dueDate` from the response with the `200` status






