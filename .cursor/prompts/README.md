# Slash Commands

These are saved prompts for use in Cursor or Claude. Each one is a checkpoint in the development workflow.

## Workflow Order

| Step | Command | Purpose |
|------|---------|---------|
| 1 | `/create-issue` | Capture bugs/features fast while mid-development |
| 2 | `/explore` | Understand the problem before writing code |
| 3 | `/create-plan` | Generate markdown execution plan with status tracking |
| 4 | `/execute` | Implement the plan step by step |
| 5 | `/review` | Comprehensive code review |
| 6 | `/peer-review` | Evaluate findings from other models |
| 7 | `/document` | Update docs + CHANGELOG after code changes |

## Utility Commands

| Command | Purpose |
|---------|---------|
| `/learning-opportunity` | Shift AI into teaching mode for deeper understanding |

## Files

- `create-issue.md` - Quick issue capture
- `explore.md` - Initial exploration stage
- `create-plan.md` - Plan creation with status tracking
- `execute.md` - Implementation phase
- `review.md` - Code review checklist
- `peer-review.md` - Cross-model review evaluation
- `document.md` - Documentation updates
- `learning-opportunity.md` - Teaching mode

## Usage in Cursor

1. Open Command Palette
2. Type the command name (e.g., "explore")
3. The prompt will be loaded into context

## Key Rules

- **Never implement during /explore or /create-plan** - Only implement during /execute
- **Never guess requirements** - Ask clarifying questions until ambiguity is removed
- **Update the plan as you go** - Track progress with 🟩🟨🟥 emojis
- **Fix root cause, not symptoms** - Use the dogfooding loop when mistakes happen
