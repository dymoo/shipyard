# Triage labels

Use exactly one lifecycle label on an issue or pull request:

| Label             | Meaning                                                 | Next owner                  |
| ----------------- | ------------------------------------------------------- | --------------------------- |
| `needs-triage`    | Raw request without a verified Agent Brief              | Triage agent or human       |
| `needs-info`      | Missing product, technical, or reproduction information | Reporter or human           |
| `ready-for-agent` | Fully specified, unblocked work with an Agent Brief     | Fresh implementation agent  |
| `ready-for-human` | Draft implementation is ready for merge judgement       | Orchestrator agent or human |
| `wontfix`         | Intentionally not planned                               | No action                   |

Wayfinder initiatives additionally use one `wayfinder:*` frontier label:
`wayfinder:map`, `wayfinder:research`, `wayfinder:prototype`,
`wayfinder:grilling`, or `wayfinder:task`.

Labels describe state, not priority, complexity, component ownership, or
implementation detail. Record those in the Agent Brief.
