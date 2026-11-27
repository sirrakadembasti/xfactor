import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const names = `
testInventory.js
testHarness.js
test_manager_recovery_simulation.js
test_reverification.js
test_contract_draft_rejection.js
test_reverification_checkpoint_preservation.js
test_requirement_coverage.js
test_requirement_coverage_pipeline.js
test_schema_canonical_constraints.js
test_requirement_assertion_bindings.js
test_requirement_assertion_verifier.js
test_execution_progress.js
test_controlled_repair_plan.js
test_controlled_repair_routes.js
test_controlled_review_action.js
test_controlled_repair_context.js
test_controlled_repairs.js
test_controlled_repair_presentation.js
test_controlled_repair_workflow.js
test_controlled_repair_acceptance.js
test_controlled_repair_lineage.js
test_controlled_semantic_plan.js
test_controlled_semantic_pipeline.js
test_ui_language_binding.js
test_completion_atomic_hook.js
test_semantic_proof_retention.js
test_management_seed_protocol.js
test_attempt_observation.js
test_production_language_policy.js
test_ui_language_evidence.js
test_ui_language_catalogue.js
test_dependency_lock_reuse.js
test_admin_cli.js
test_agent_document_boundary.js
test_agent_contract_schemas.js
test_api_fixture_setup.js
test_artifact_inventory_private_files.js
test_artifact_lifecycle.js
test_backend.js
test_build_sandbox_gate.js
test_build_validator.js
test_build_verifier.js
test_cancellation_and_deadlines.js
test_checkpoint_resume.js
test_coder_context.js
test_concurrency_pool.js
test_database_migrations.js
test_deep_verification.js
test_disk_sync_and_isolation.js
test_docs_agent_sync.js
test_domain_policy.js
test_e2e_simulation.js
test_execution_client_poll.js
test_generation_isolation.js
test_generation_resume.js
test_worker_repairs.js
test_verification_budget.js
test_frontend_runtime_plan.js
test_generated_docker_artifact.js
test_graphify.js
test_health_and_lifecycle.js
test_http_integration.js
test_isolated_storage_roots.js
test_p0_a_capability_check.js
test_p0_a_contract_flow.js
test_p0_a_cutover.js
test_p0_a_migrations.js
test_p0_a_rejections.js
test_p0_a_state_transitions.js
test_p0_b_migrations.js
test_p0_c_cas_invalidation.js
test_p0_c_checkpoint_repository.js
test_p0_c_selective_rejection.js
test_p0_c_workflow_integration.js
test_p1_10_db_constraints_indexes.js
test_p1_11_generation_quotas.js
test_p1_12_pagination_limits.js
test_p1_13_async_error_propagation.js
test_p1_14_websocket_limits.js
test_p1_1_abort_signal.js
test_p1_2_pause_resume_lease.js
test_p1_3_concurrency_rejection.js
test_p1_4_file_ownership.js
test_p1_5_multi_process_lease.js
test_p1_6_canonical_repository.js
test_p1_7_pure_get_and_sync.js
test_p1_8_create_delete_boundary.js
test_p1_9_optimistic_revision.js
test_p1_a_migrations.js
test_p1_a_pipeline_allowlist.js
test_p1_b_api.js
test_p1_b_browser.js
test_p1_b_database.js
test_p1_b_health_prober.js
test_p1_b_manifest.js
test_p1_b_process.js
test_p1_b_quality_policy_evidence.js
test_p1_b_smoke.js
test_role_session_adapter.js
test_p1_b_test_infra.js
test_p1_c_archive.js
test_p1_c_artifact_verifier.js
test_p1_c_repository.js
test_p1_c_safe_extraction.js
test_p1_c_state_invalidation.js
test_p2_completion_report.js
test_p2_contamination.js
test_p2_domain_policy.js
test_p2_frontend.js
test_p2_placeholder.js
test_p2_readme.js
test_p2_repair_allowlist.js
test_p2_scope_priority.js
test_p2_security_auth.js
test_p2_security_baseline.js
test_p3_observability.js
test_p4_production_safety.js
test_p5_artifact_completion.js
test_p5_execution_boundary.js
test_p5_mfa_login.js
test_p6_archive_ownership.js
test_p6_static_serving.js
test_p7_approve_state.js
test_p7_delete_protection.js
test_p7_files_api.js
test_p7_readme_generator.js
test_p7_reconciliation.js
test_reconciliation_boundary.js
test_p7_sqlite_durability.js
test_p8_ci_contract.js
test_p8_mfa_crypto.js
test_p8_sandbox_limits.js
test_p8_security_operations.js
test_p9_artifact_pipeline.js
test_p9_backup_restore.js
test_p9_checkpoint_dependencies.js
test_p9_data_recovery.js
test_p9_lease_fencing.js
test_p9_runner_inventory.js
test_p9_session_revocation.js
test_p9_verification_pipeline.js
test_p1_7_task1_auto_register.js
test_p1_7_task1_routes.js
test_package_verifier.js
test_project_action_chat_audit.js
test_project_repository.js
test_project_token_usage.js
test_project_tree_env_exclusion.js
test_project_file_reader.js
test_project_state_rehydration.js
test_quality_gate.js
test_reviewer_context.js
test_scaffold_auth_standards.js
test_scaffold_dependency_scan.js
test_quiz_runtime_remediation.js
test_quality_policy_integration.js
test_runner.js
test_runner_failure_reasons.js
test_infrastructure_failure_classification.js
test_worker_check_log_tail.js
test_transaction_await_boundary.js
test_db_transaction_measurement.js
test_heartbeat_connection.js
test_runtime_verification.js
test_sandbox_adapters.js
test_sandbox_security.js
test_subprocess_sandbox.js
test_symlink_isolation.js
test_test_harness.js
test_traceability_capabilities.js
test_traceability_matrix.js
test_tur2_edge_cases.js
test_websocket_integration.js
test_workflow_attempts.js
test_workflow_state_initialization.js
test_workflow_failure_chat_event.js
test_manager_error_telemetry.js
test_manager_management_discovery.js
test_llm_auth.js
test_manager_chat_failures.js
test_llm_runtime_controls.js
test_llm_task_retry.js
test_backup_wal.js
test_provider_dns.js
test_download_completion.js
test_next_generated_import_audit.js
test_dev_verification_fallback.js
test_workflow_dev_fallback.js
`.trim().split(/\n/);

const support = new Set(['testInventory.js', 'testHarness.js', 'test_runner.js']);
const docker = new Set(['test_p8_sandbox_limits.js']);
const optInDocker = new Set(['test_generated_docker_artifact.js']);
const browser = new Set(['test_p1_b_browser.js']);
const integration = new Set([
    'test_reverification.js',
    'test_execution_progress.js',
    'test_http_integration.js', 'test_websocket_integration.js',
    'test_health_and_lifecycle.js', 'test_p1_b_api.js', 'test_p1_b_process.js',
    'test_p1_b_smoke.js', 'test_p2_frontend.js'
]);

export const TEST_INVENTORY = Object.freeze(names.map(file => Object.freeze({
    file,
    run: !support.has(file) && !optInDocker.has(file),
    classification: support.has(file) ? 'support' : (docker.has(file) || optInDocker.has(file) ? 'docker' : (browser.has(file) ? 'browser' : (integration.has(file) ? 'integration' : 'unit'))),
    prerequisites: docker.has(file) || optInDocker.has(file) ? ['docker-daemon'] : (browser.has(file) ? ['chromium'] : []),
    reason: support.has(file)
        ? 'Runner support module; imported by suites, not a standalone suite.'
        : optInDocker.has(file)
            ? 'Explicit Docker artifact acceptance suite; run with npm run test:docker:artifact.'
            : docker.has(file)
            ? 'Requires a real Docker daemon; absence is an explicit failure.'
            : browser.has(file)
                ? 'Requires the browser verifier and Chromium capability.'
                : integration.has(file)
                    ? 'Starts an isolated HTTP/WebSocket surface on loopback.'
                    : 'Self-contained backend behavior with isolated temporary state.'
})));

export function getRunnableTestFiles() {
    return TEST_INVENTORY.filter(entry => entry.run);
}

export async function discoverTestFiles(testsDir = path.dirname(fileURLToPath(import.meta.url))) {
    const entries = await fs.readdir(testsDir, { withFileTypes: true });
    return entries.filter(entry => entry.isFile() && /^test.*\.js$/i.test(entry.name)).map(entry => entry.name).sort();
}

export async function assertCompleteTestInventory(testsDir) {
    const discovered = await discoverTestFiles(testsDir);
    const listed = TEST_INVENTORY.map(entry => entry.file).sort();
    const unclassifiedTestFiles = discovered.filter(file => !listed.includes(file));
    const staleInventoryEntries = listed.filter(file => !discovered.includes(file));
    if (unclassifiedTestFiles.length || staleInventoryEntries.length) {
        throw new Error(`Test inventory mismatch: unclassified=${unclassifiedTestFiles.join(',') || 'none'} stale=${staleInventoryEntries.join(',') || 'none'}`);
    }
    return { discovered, unclassifiedTestFiles, staleInventoryEntries };
}
