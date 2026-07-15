# forge-sdlc-power source map
- POWER.md defines Kiro Power metadata, activation, onboarding, hooks, and adapter docs.
- adapters/ contains install/orchestration and adapter implementations.
- hooks/ contains hook scripts and node tests.
- package.json governs test commands; adapters/install.test.js is installer coverage.
- Verification tasks commonly inspect JSON wiring, installer registry state, and POWER.md claims.
References: `mem:tech_stack` for runtime/tooling; `mem:suggested_commands` for commands; `mem:task_completion` for done checks; `mem:conventions` for code conventions.