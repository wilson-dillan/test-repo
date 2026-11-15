import PropTypes from 'prop-types';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFilePdf } from '@fortawesome/free-solid-svg-icons/faFilePdf';
import { faFileImage } from '@fortawesome/free-solid-svg-icons/faFileImage';

export function AttachmentIcon({ mimeType }) {
    return mimeType === 'application/pdf' ? (
        <FontAwesomeIcon icon={faFilePdf} className="text-danger" />
    ) : (
        <FontAwesomeIcon icon={faFileImage} className="text-primary" />
    );
}

AttachmentIcon.propTypes = {
    mimeType: PropTypes.string,
};
