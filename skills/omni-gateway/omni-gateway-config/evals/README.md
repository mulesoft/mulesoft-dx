# omni-gateway-config evals

Trigger-and-behavior evals for this skill, following the
[evaluating-skills guide](https://agentskills.io/docs/evaluating-skills). They
check two things: does the skill **trigger** when it should (and stay quiet when
it shouldn't), and given it fired, does the agent do the **right thing**.

Evals are a best practice, not part of the [skill spec](https://agentskills.io/specification) —
`SKILL.md` + its frontmatter is all the spec requires. This `evals/` directory
is ignored by the skill loader.

## `evals.json` schema

`{ "skill": "<name>", "cases": [ <case>, ... ] }`. Each case:

| Field | Type | Meaning |
|-------|------|---------|
| `id` | string | Stable kebab-case identifier, unique in the file |
| `prompt` | string | The user message handed to the agent |
| `should_trigger` | boolean | Whether this skill is expected to activate |
| `context` | string\|null | Optional setup the grader should stage (files present, prior state) |
| `assertions` | string[] | Observable expectations on the agent's response / tool use |
| `anti_assertions` | string[] | Behaviors that, if present, fail the case |

## Methodology notes

- **Baseline vs. with-skill.** Run trigger cases with the skill disabled too, to
  confirm the behavior comes from the skill and not the base model.
- **Trigger-rate over single runs.** Activation is probabilistic — run each case
  several times and track the rate.
- **Keep prompts realistic.** Phrase prompts the way an operator actually would,
  including vague symptom descriptions that should still route here.

There is no bundled runner yet; score cases manually or wire `evals.json` into
your own grader (string match or LLM-as-judge).
