## Summary

<!-- What does this PR do, and why? Link the issue it addresses. -->

## Checklist

- [ ] `pre-commit run --all-files` passes
- [ ] Tests cover the change (a bug fix has a test that fails without it)
- [ ] No poem content: no poem text, poem files, or unpublished titles or names
- [ ] If this changes how the player follows the writing: `MIDST_KEY_SCHEME=legacy npm run e2e:frame-budget -- --headed` run locally if possible (the `frame-budget` workflow runs it regardless)

## Notes

<!-- Anything a reviewer should know -->
