---
title: "{{{topic}}}"
date: {{date}}
session_id: {{id}}
participants: {{participant_count}}
status: {{status}}
tags:
{{#tags}}
  - {{{.}}}
{{/tags}}
---

# {{{topic}}}

**Goal:** {{{goal}}}
{{#critical}}
**Critical Question:** {{{critical}}}
{{/critical}}

{{#context}}
## Context

{{{context}}}
{{/context}}

{{#summary}}
## Summary

{{{summary}}}
{{/summary}}

{{#responses}}
## Participant Responses

{{#participants}}
### Participant {{number}}

{{#messages}}
> {{{content}}}

{{/messages}}
{{/participants}}
{{/responses}}
