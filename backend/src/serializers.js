const { PROJECT_TYPES } = require('./projectTypes');

function toProject(row) {
    return {
        id: row.id,
        type: row.type,
        typeLabel: PROJECT_TYPES[row.type]?.label || row.type,
        customerName: row.customer_name,
        customerFirstName: row.customer_first_name,
        customerLastName: row.customer_last_name,
        address: row.address,
        dueDate: row.due_date,
        owner: { id: row.owner_id, name: row.owner_name },
        state: row.state,
        active: row.active,
        financing: row.financing,
        financingProvider: row.financing_provider,
        financingOther: row.financing_other,
        heatsWithGas: row.heats_with_gas,
        integratedControls: row.integrated_controls,
        controlsType: row.controls_type,
        controlsOther: row.controls_other,
        submittedAt: row.submitted_at,
        rebateNumber: row.rebate_number,
        rebateAmount:
            row.rebate_amount === null || row.rebate_amount === undefined
                ? null
                : Number(row.rebate_amount),
        rebateReceivedOn: row.rebate_received_on,
        housecallCustomerId: row.housecall_customer_id || null,
        createdAt: row.created_at,
        completedAt: row.completed_at,
        ...(row.task_total !== undefined && {
            taskTotal: Number(row.task_total),
            taskDone: Number(row.task_done),
            status: projectStatus(row.state, Number(row.task_done)),
        }),
    };
}

// To Do (nothing uploaded) / In Progress (some) / Submitted / Done (rebate
// received). Counts only the documents this project actually needs.
function projectStatus(state, tasksDone) {
    if (state === 'done' || state === 'submitted') return state;
    return tasksDone > 0 ? 'in_progress' : 'todo';
}

function toTask(row) {
    return {
        id: row.id,
        code: `#${row.project_id}${row.letter}`,
        name: row.name,
        formName: row.form_name,
        owner: { id: row.owner_id, name: row.owner_name },
        state: row.state,
        // false when this project doesn't need the document
        active: row.active,
        notes: row.notes,
        projectId: row.project_id,
        createdAt: row.created_at,
        completedAt: row.completed_at,
        ...(row.customer_name !== undefined && {
            customerName: row.customer_name,
            dueDate: row.due_date,
            projectActive: row.project_active,
            projectState: row.project_state,
        }),
        ...(row.attachment_count !== undefined && {
            attachmentCount: Number(row.attachment_count),
        }),
        ...(row.doc_id !== undefined && {
            latestDocument: row.doc_id && {
                id: row.doc_id,
                filename: row.doc_filename,
                uploadedBy: row.doc_uploaded_by,
                createdAt: row.doc_created_at,
            },
        }),
    };
}

function toAttachment(row) {
    return {
        id: row.id,
        filename: row.filename,
        mimeType: row.mime_type,
        size: row.size,
        uploadedBy: row.uploaded_by_name || 'Deleted user',
        createdAt: row.created_at,
    };
}

module.exports = { toProject, toTask, toAttachment, projectStatus };
