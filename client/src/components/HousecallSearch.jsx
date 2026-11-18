import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import Form from 'react-bootstrap/Form';
import Spinner from 'react-bootstrap/Spinner';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faLocationDot,
    faMagnifyingGlass,
} from '@fortawesome/free-solid-svg-icons';
import { api } from '../api';

// Search box for Housecall Pro customers: one entry per customer, with a
// choice of address when they have several. Picking hands back
// { customerId, firstName, lastName, address }.
export function HousecallSearch({ onPick }) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        const q = query.trim();
        if (q.length < 2) {
            setResults(null);
            setError(null);
            setLoading(false);
            return;
        }
        let cancelled = false;
        setLoading(true);
        // Wait for a pause in typing before asking Housecall Pro.
        const timer = setTimeout(() => {
            api.get(`/housecall/customers?q=${encodeURIComponent(q)}`)
                .then((found) => {
                    if (!cancelled) {
                        setResults(found);
                        setError(null);
                    }
                })
                .catch((err) => !cancelled && setError(err.message))
                .finally(() => !cancelled && setLoading(false));
        }, 300);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [query]);

    const pick = (customer, address) => {
        onPick({ ...customer, address: address || '' });
        setQuery('');
    };

    const matches = results?.filter((c) => c.nameMatch) || [];
    const others = results?.filter((c) => !c.nameMatch) || [];

    const renderCustomer = (c) => (
        <li key={c.customerId} className="hcp-customer">
            {c.addresses.length <= 1 ? (
                <button type="button" onClick={() => pick(c, c.addresses[0])}>
                    <span className="name">{c.name}</span>
                    <span className="addr">
                        <FontAwesomeIcon
                            icon={faLocationDot}
                            className="me-1"
                        />
                        {c.addresses[0] || 'No address on file'}
                    </span>
                </button>
            ) : (
                <div className="multi">
                    <span className="name">{c.name}</span>
                    <span className="hint">
                        {c.addresses.length} addresses. Choose the job site:
                    </span>
                    {c.addresses.map((a) => (
                        <button
                            type="button"
                            key={a}
                            className="addr-choice"
                            onClick={() => pick(c, a)}
                        >
                            <FontAwesomeIcon
                                icon={faLocationDot}
                                className="me-1"
                            />
                            {a}
                        </button>
                    ))}
                </div>
            )}
        </li>
    );

    return (
        <div className="hcp-search">
            <Form.Label htmlFor="hcpSearch">
                Search Housecall Pro customers
            </Form.Label>
            <div className="hcp-input">
                <FontAwesomeIcon icon={faMagnifyingGlass} className="icon" />
                <Form.Control
                    id="hcpSearch"
                    type="search"
                    placeholder="Name, address, phone or email"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                        // Enter picks the top single-address match instead
                        // of moving on.
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            e.stopPropagation();
                            const top = results?.[0];
                            if (top && top.addresses.length <= 1)
                                pick(top, top.addresses[0]);
                        }
                    }}
                    autoFocus
                    autoComplete="off"
                />
                {loading && <Spinner animation="border" size="sm" />}
            </div>

            {error && <div className="small text-danger mt-2">{error}</div>}
            {results && !error && (
                <ul className="hcp-results">
                    {results.length === 0 && (
                        <li className="empty">
                            No matching customers. Type their details below.
                        </li>
                    )}
                    {matches.map(renderCustomer)}
                    {others.length > 0 && (
                        <li className="group-label">
                            Other matches (matched on other details)
                        </li>
                    )}
                    {others.map(renderCustomer)}
                </ul>
            )}
        </div>
    );
}

HousecallSearch.propTypes = { onPick: PropTypes.func.isRequired };
