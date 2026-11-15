import { useState } from 'react';
import PropTypes from 'prop-types';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import InputGroup from 'react-bootstrap/InputGroup';
import { FileDropZone } from './FileDropZone';

export function AddItemForm({ onNewItem }) {
    const [newItem, setNewItem] = useState('');
    const [files, setFiles] = useState([]);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);

    const submitNewItem = (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);

        const body = new FormData();
        body.append('name', newItem);
        files.forEach((file) => body.append('files', file));

        fetch('/api/items', { method: 'POST', body })
            .then(async (r) => {
                const data = await r.json().catch(() => ({}));
                if (!r.ok)
                    throw new Error(data.error || 'Could not add the item.');
                return data;
            })
            .then((item) => {
                onNewItem(item);
                setNewItem('');
                setFiles([]);
            })
            .catch((err) => setError(err.message))
            .finally(() => setSubmitting(false));
    };

    return (
        <Form onSubmit={submitNewItem}>
            <InputGroup className="mb-3">
                <Form.Control
                    value={newItem}
                    onChange={(e) => setNewItem(e.target.value)}
                    type="text"
                    placeholder="New Item"
                    aria-label="New item"
                />
                <Button
                    type="submit"
                    variant="success"
                    disabled={!newItem.length || submitting}
                >
                    {submitting ? 'Adding...' : 'Add Item'}
                </Button>
            </InputGroup>
            <FileDropZone
                files={files}
                onFilesChange={setFiles}
                disabled={submitting}
            />
            {error && (
                <Alert
                    variant="danger"
                    dismissible
                    onClose={() => setError(null)}
                >
                    {error}
                </Alert>
            )}
        </Form>
    );
}

AddItemForm.propTypes = {
    onNewItem: PropTypes.func,
};
