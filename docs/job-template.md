---
name: jtbd-name-in-kebab-case
description: |
  [Action verb] [what it does]. [Additional context]. Use when [trigger terms
  for AI discovery - mention key concepts, tools, patterns that would make an
  AI agent select this job].
---

# Job To Be Done Title

## Overview

[Action verb] a [thing] with [key features]. [Explain the context and why this JTBD exists]. [Mention what makes it useful or important].

**What you'll build:** [Clear, concise statement of the end result]

## Prerequisites

Before starting, ensure you have:

1. **[Category 1 - e.g., Authentication]**
   - [Specific requirement]
   - [How to obtain or verify it]

2. **[Category 2 - e.g., Resources]**
   - [Specific requirement]
   - [How to obtain or verify it]

3. **[Category 3 - e.g., Permissions]**
   - [Specific requirement]
   - [How to obtain or verify it]

## Execution Paths

(Optional - include only for skills with multiple execution paths)

This skill has multiple execution paths depending on what you already have:

- **[Path name]**: Steps 1, 2, 3, 4
  - When: [condition when user needs all steps]
  - You'll need: `[variable1]`

- **[Another path]**: Steps 2, 4
  - When: [condition when user can skip earlier steps]
  - You'll need: `[variable1]`, `[variable2]`, `[variable3]`

## Step 1: [Action-Oriented Step Name]

> **Skip if:** [Condition when this step can be skipped. Include which variables the user should already have.]

(Optional - include the skip annotation only for steps that can be skipped)

[Prose explanation of what this step does and why it's needed. Provide context about when this would be used and what it accomplishes.]

**What you'll need:**
- [Input 1 you'll need to provide or select]
- [Input 2 you'll need to provide or select]
- [Input 3 you'll need to provide or select]

**Action:** [Clear, one-sentence instruction of what to do]

```yaml
api: urn:api:api-folder-name
operationId: actualOperationId
inputs:
  # From another API
  parameterName:
    from:
      api: urn:api:other-api-name
      operation: operationName
      field: $.fieldPath  # JSONPath expression (e.g., $.id, $.data[*].id)
      name: semanticName  # optional
    description: What this parameter represents
    alternatives:  # optional
      - field: $.alternativeFieldPath
        description: Alternative source for this value

  # From previous step output
  anotherParameter:
    from:
      step: [Previous Step Name]
      output: outputVariableName
    description: The value captured from previous step

  # From previous step input (reuse)
  reusedParameter:
    from:
      step: [Previous Step Name]
      input: inputParameterName
    description: Same value as used in previous step

  # Literal value
  constantParameter:
    value: "literal-value"
    description: Fixed value for this parameter

  # User-provided value
  userParameter:
    userProvided: true
    description: Description of what user should provide
    example: "example-value"
    pattern: "^regex-pattern$"  # optional validation
    required: true  # optional, default true

outputs:
  - name: outputVariableName
    path: $.fieldPath  # JSONPath expression to extract from response
    description: What this output represents and how it will be used
```

**What happens next:** [Explain the outcome and how it connects to the next steps]

**Common issues:** (remove this section if no known issues)
- **[Issue name]**: [Cause and solution]
- **[Another issue]**: [Cause and solution]

## Step 2: [Action-Oriented Step Name]

[Repeat structure above for each step]

```yaml
step: 2
name: [Step Name]
api: urn:api:api-folder-name
operationId: operationName
inputs:
  [... inputs as above ...]
outputs:
  [... outputs as above ...]
```

**What happens next:** [Outcome description]

## Step N: [Final Step Name]

[Continue with as many steps as needed]

## Completion Checklist

After completing all steps, verify:

- [ ] [Verification item 1]
- [ ] [Verification item 2]
- [ ] [Verification item 3]
- [ ] [Test item 1]
- [ ] [Test item 2]

## What You've Built

Your [thing] now has:

✅ **[Feature category 1]**
- [Feature detail 1]
- [Feature detail 2]

✅ **[Feature category 2]**
- [Feature detail 1]
- [Feature detail 2]

✅ **[Feature category 3]**
- [Feature detail 1]
- [Feature detail 2]

## Next Steps

Now that your [thing] is [state]:

1. **[Next action 1]**
   - [Detail or sub-step]
   - [Detail or sub-step]
   - [Reference to related JTBD if applicable]

2. **[Next action 2]**
   - [Detail or sub-step]
   - [Detail or sub-step]

3. **[Next action 3]**
   - [Detail or sub-step]
   - [Detail or sub-step]

4. **[Next action 4]**
   - [Detail or sub-step]
   - [Detail or sub-step]

## Tips and Best Practices

### [Category 1 - e.g., Design Considerations]
- **[Bold tip headline]**: [Explanation]
- **[Another tip]**: [Explanation]
- **[Another tip]**: [Explanation]

### [Category 2 - e.g., Security Best Practices]
- **[Bold tip headline]**: [Explanation]
- **[Another tip]**: [Explanation]
- **[Another tip]**: [Explanation]

### [Category 3 - e.g., Operational Tips]
- **[Bold tip headline]**: [Explanation]
- **[Another tip]**: [Explanation]
- **[Another tip]**: [Explanation]

## Troubleshooting

### [Issue Name - e.g., Creation Fails with 400 Error]

**Symptoms:** [Description of what the user sees]

**Possible causes:**
- [Cause 1]
- [Cause 2]
- [Cause 3]

**Solutions:**
- [Solution 1 with specific steps]
- [Solution 2 with specific steps]
- [Solution 3 with specific steps]

### [Another Issue Name]

**Symptoms:** [Description]

**Possible causes:**
- [Cause]

**Solutions:**
- [Solution]

### [Another Issue Name]

(Add as many troubleshooting sections as needed for common problems)

## Related Jobs

- **[jtbd-name]**: [One-line description of what it does and when to use it]
- **[another-jtbd]**: [One-line description]
- **[third-jtbd]**: [One-line description]

## Additional Resources

(Optional - only if external documentation is helpful)

- **[Resource name]**: [URL]
- **[Resource name]**: [URL]

---

**Need help?** [Guidance on where to get support or what to check]
