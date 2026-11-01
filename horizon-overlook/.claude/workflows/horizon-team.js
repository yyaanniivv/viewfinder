/**
 * Horizon Overlook - Team Collaboration Workflow
 *
 * Roles:
 * - PM (Project Manager): Coordinator, primary interface, plans & delegates
 * - Product: Requirements, priorities, acceptance criteria
 * - Coder: Implementation, code changes
 * - Tester: Test creation, execution, verification
 * - Reviewer: Code review, security, correctness
 * - Designer: UX/UI, visual design, accessibility
 *
 * Usage:
 *   - PM receives task, breaks it down, delegates to specialists
 *   - Specialists work in parallel where possible
 *   - PM synthesizes results, ensures completeness
 *   - You primarily talk to PM
 */

export const meta = {
  name: 'horizon-team',
  description: 'Full team collaboration: PM coordinates coder, tester, reviewer, designer, product',
  phases: [
    { title: 'Planning', detail: 'PM analyzes task, product defines requirements, designer reviews UX' },
    { title: 'Implementation', detail: 'Coder implements, tester writes tests in parallel' },
    { title: 'Verification', detail: 'Reviewer audits, tester executes, designer validates' },
    { title: 'Synthesis', detail: 'PM integrates feedback, confirms done' },
  ],
}

import { agent, parallel, phase } from '@claude/workflow'

// Agent configurations
const AGENT_CONFIG = {
  pm: {
    system: `You are the Project Manager for Horizon Overlook (AR horizon marker app).
    Your role: Coordinate the team, break down tasks, delegate to specialists, synthesize results.
    You are the PRIMARY interface - the user talks to you.
    Track progress, manage dependencies, ensure quality gates pass.
    Keep responses concise but complete. Report status at each phase.`,
    model: 'opus',
  },
  product: {
    system: `You are the Product Owner for Horizon Overlook.
    Define requirements, acceptance criteria, priorities, edge cases.
    Know the plan.md, user needs (50th floor, 7-15km markers, offline-first, PWA).
    Focus on: What should be built, why, and how to verify it works for users.`,
    model: 'sonnet',
  },
  coder: {
    system: `You are the Coder for Horizon Overlook.
    Implement features in React + TypeScript + Three.js + WebXR.
    Follow the existing codebase patterns in src/core/, src/web/, src/shared/.
    Write clean, typed, performant code. No console.log in production.
    Output: File changes, implementation details.`,
    model: 'sonnet',
  },
  tester: {
    system: `You are the Tester for Horizon Overlook.
    Write unit tests (Jest) for core/geo.ts, core/calibration.ts, core/storage.ts.
    Write integration tests for WebXR flows (mock XRSession).
    Define manual test procedures for device testing (compass, GPS, AR).
    Focus on: Correctness, edge cases, regression prevention.`,
    model: 'sonnet',
  },
  reviewer: {
    system: `You are the Code Reviewer for Horizon Overlook.
    Review for: correctness bugs, security issues, performance, maintainability.
    Check: GPS math accuracy, WebXR session handling, memory leaks, TypeScript strictness.
    Output: Findings with severity, file:line, fix suggestions.`,
    model: 'opus',
  },
  designer: {
    system: `You are the Designer for Horizon Overlook.
    Review: Visual hierarchy, color contrast (WCAG AA), touch targets (44px min),
    motion reduction, dark/light mode, safe areas, loading states, error states.
    Focus on: Mobile AR UX, compass readability, marker legibility at distance.`,
    model: 'sonnet',
  },
}

// Task template for delegation
function delegateTo(role: keyof typeof AGENT_CONFIG, task: string, context?: string) {
  return agent(
    `${AGENT_CONFIG[role].system}\n\nTask: ${task}\n${context ? `\nContext:\n${context}` : ''}`,
    {
      label: role,
      model: AGENT_CONFIG[role].model,
    }
  )
}

// Main workflow execution
export default async function horizonTeamWorkflow(task: string) {
  // Phase 1: Planning
  await phase('Planning')
  const [productPlan, designInput] = await parallel([
    delegateTo('product', `Define requirements and acceptance criteria for: ${task}`),
    delegateTo('designer', `Review UX implications and design requirements for: ${task}`),
  ])

  const pmPlan = await delegateTo('pm',
    `Create implementation plan for: ${task}\n\nProduct requirements:\n${productPlan}\n\nDesign input:\n${designInput}`,
    'Planning phase - break into subtasks for coder/tester'
  )

  // Phase 2: Implementation (parallel)
  await phase('Implementation')
  const [codeResult, testResult] = await parallel([
    delegateTo('coder', `Implement: ${task}\n\nPlan:\n${pmPlan}`),
    delegateTo('tester', `Write tests for: ${task}\n\nPlan:\n${pmPlan}\n\nProduct requirements:\n${productPlan}`),
  ])

  // Phase 3: Verification (parallel)
  await phase('Verification')
  const [reviewResult, designReview, testExec] = await parallel([
    delegateTo('reviewer', `Review implementation:\n${codeResult}\n\nTests:\n${testResult}`),
    delegateTo('designer', `Validate implemented UX against design requirements:\n${designInput}`),
    delegateTo('tester', `Execute tests and verify: ${task}\n\nImplementation:\n${codeResult}`),
  ])

  // Phase 4: Synthesis
  await phase('Synthesis')
  const finalReport = await delegateTo('pm',
    `Synthesize results for: ${task}

    Implementation: ${codeResult}
    Tests: ${testResult}
    Review: ${reviewResult}
    Design Review: ${designReview}
    Test Execution: ${testExec}

    Confirm all acceptance criteria met. List any follow-ups.`
  )

  return {
    task,
    plan: pmPlan,
    implementation: codeResult,
    tests: testResult,
    review: reviewResult,
    designReview,
    testExecution: testExec,
    summary: finalReport,
  }
}