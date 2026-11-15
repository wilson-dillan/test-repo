import PropTypes from 'prop-types';
import Container from 'react-bootstrap/Container';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import Button from 'react-bootstrap/Button';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTrash } from '@fortawesome/free-solid-svg-icons/faTrash';
import faCheckSquare from '@fortawesome/fontawesome-free-regular/faCheckSquare';
import faSquare from '@fortawesome/fontawesome-free-regular/faSquare';
import { AttachmentIcon } from './AttachmentIcon';
import { formatFileSize } from './fileSize';
import './ItemDisplay.scss';

export function ItemDisplay({ item, onItemUpdate, onItemRemoval }) {
    const toggleCompletion = () => {
        fetch(`/api/items/${item.id}`, {
            method: 'PUT',
            body: JSON.stringify({
                name: item.name,
                completed: !item.completed,
            }),
            headers: { 'Content-Type': 'application/json' },
        })
            .then((r) => r.json())
            .then(onItemUpdate);
    };

    const removeItem = () => {
        fetch(`/api/items/${item.id}`, { method: 'DELETE' }).then(() =>
            onItemRemoval(item),
        );
    };

    return (
        <Container fluid className={`item ${item.completed && 'completed'}`}>
            <Row>
                <Col xs={2} className="text-center">
                    <Button
                        className="toggles"
                        size="sm"
                        variant="link"
                        onClick={toggleCompletion}
                        aria-label={
                            item.completed
                                ? 'Mark item as incomplete'
                                : 'Mark item as complete'
                        }
                    >
                        <FontAwesomeIcon
                            icon={item.completed ? faCheckSquare : faSquare}
                        />
                        <i
                            className={`far ${
                                item.completed ? 'fa-check-square' : 'fa-square'
                            }`}
                        />
                    </Button>
                </Col>
                <Col xs={8} className="name">
                    {item.name}
                    {item.attachments?.length > 0 && (
                        <ul className="attachments">
                            {item.attachments.map((attachment) => (
                                <li key={attachment.id}>
                                    <a
                                        href={`/api/items/${item.id}/attachments/${attachment.id}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        <AttachmentIcon
                                            mimeType={attachment.mimeType}
                                        />
                                        <span>{attachment.filename}</span>
                                    </a>
                                    <span className="text-muted">
                                        {formatFileSize(attachment.size)}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </Col>
                <Col xs={2} className="text-center remove">
                    <Button
                        size="sm"
                        variant="link"
                        onClick={removeItem}
                        aria-label="Remove Item"
                    >
                        <FontAwesomeIcon
                            icon={faTrash}
                            className="text-danger"
                        />
                    </Button>
                </Col>
            </Row>
        </Container>
    );
}

ItemDisplay.propTypes = {
    item: PropTypes.shape({
        id: PropTypes.string,
        name: PropTypes.string,
        completed: PropTypes.bool,
        attachments: PropTypes.arrayOf(
            PropTypes.shape({
                id: PropTypes.string,
                filename: PropTypes.string,
                mimeType: PropTypes.string,
                size: PropTypes.number,
            }),
        ),
    }),
    onItemUpdate: PropTypes.func,
    onItemRemoval: PropTypes.func,
};
