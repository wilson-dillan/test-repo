const { PROJECT_TYPES } = require('./projectTypes');

function toProject(row) {
    return {
        id: row.id,
        type: row.type,
        typeLabel: PROJECT_TYPES[row.type]?.label || row.type,
        customerName: row.customer_name,
        address: row.address,
        dueDate: row.due_date,
        owner: { id: row.owner_id, name: row.owner_name },
        state: row.state,
        active: row.active,
        createdAt: row.created_at,
        completedAt: row.completed_at,
        ...(row.task_total !== undefined && {
            taskTotal: Number(row.task_total),
            taskDone: Number(row.task_done),
        }),
    };
}

function toTask(row) {
    return {
        id: row.id,
        code: `#${row.project_id}${row.letter}`,
        name: row.name,
        formName: row.form_name,
        owner: { id: row.owner_id, name: row.owner_name },
        state: row.state,
        notes: row.notes,
        projectId: row.project_id,
        createdAt: row.created_at,
        completedAt: row.completed_at,
        ...(row.customer_name !== undefined && {
            customerName: row.customer_name,
            dueDate: row.due_date,
            projectActive: row.project_active,
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
        uploadedBy: row.uploaded_by_name,
        createdAt: row.created_at,
    };
}

module.exports = { toProject, toTask, toAttachment };
