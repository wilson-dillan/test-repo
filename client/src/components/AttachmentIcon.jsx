import PropTypes from 'prop-types';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faFile,
    faFileExcel,
    faFileImage,
    faFileLines,
    faFilePdf,
    faFilePowerpoint,
    faFileWord,
} from '@fortawesome/free-solid-svg-icons';

const ICONS = [
    [/pdf/, faFilePdf, 'text-danger'],
    [/^image\//, faFileImage, 'text-primary'],
    [/word/, faFileWord, 'text-primary'],
    [/excel|spreadsheet|csv/, faFileExcel, 'text-success'],
    [/powerpoint|presentation/, faFilePowerpoint, 'text-warning'],
    [/^text\//, faFileLines, 'text-secondary'],
];

export function AttachmentIcon({ mimeType = '' }) {
    const [, icon, color] = ICONS.find(([pattern]) =>
        pattern.test(mimeType),
    ) || [null, faFile, 'text-secondary'];
    return <FontAwesomeIcon icon={icon} className={color} />;
}

AttachmentIcon.propTypes = {
    mimeType: PropTypes.string,
};
