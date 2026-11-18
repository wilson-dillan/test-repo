import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons';
import { api } from '../api';
import { useAuth } from '../hooks';
import { ProjectStatusPill } from './ui';

// Sidebar search across projects: customer name, address, project number
// (#12) or document code (#12a).
export function ProjectSearch() {
    const { version } = useAuth();
    const navigate = useNavigate();
    const input = useRef(null);
    const [query, setQuery] = useState('');
    const [projects, setProjects] = useState(null);
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0);

    // Load the project list when the search is first used, and refresh it
    // after any change in the app.
    useEffect(() => {
        if (!open && projects === null) return;
        api.get('/projects')
            .then(setProjects)
            .catch(() => setProjects([]));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, version]);

    const results = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q || !projects) return [];
        const number = q.match(/^#?(\d+)[a-z]?$/)?.[1];
        return projects
            .filter(
                (p) =>
                    String(p.id) === number ||
                    p.customerName.toLowerCase().includes(q) ||
                    p.address.toLowerCase().includes(q),
            )
            .slice(0, 8);
    }, [query, projects]);

    const go = (project) => {
        navigate(`/projects/${project.id}`);
        setQuery('');
        setOpen(false);
        input.current?.blur();
    };

    return (
        <div className="sidebar-search">
            <FontAwesomeIcon icon={faMagnifyingGlass} className="icon" />
            <input
                ref={input}
                type="search"
                placeholder="Search projects…"
                aria-label="Search projects"
                value={query}
                onChange={(e) => {
                    setQuery(e.target.value);
                    setActive(0);
                }}
                onFocus={() => setOpen(true)}
                onBlur={() => setTimeout(() => setOpen(false), 150)}
                onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setActive((i) => Math.min(i + 1, results.length - 1));
                    } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setActive((i) => Math.max(i - 1, 0));
                    } else if (e.key === 'Enter' && results[active]) {
                        go(results[active]);
                    } else if (e.key === 'Escape') {
                        setQuery('');
                        input.current?.blur();
                    }
                }}
            />

            {open && query.trim() && (
                <ul className="search-results" role="listbox">
                    {projects === null && <li className="empty">Loading…</li>}
                    {projects && results.length === 0 && (
                        <li className="empty">No matching projects</li>
                    )}
                    {results.map((p, i) => (
                        <li key={p.id}>
                            <button
                                type="button"
                                className={i === active ? 'active' : ''}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => go(p)}
                                onMouseEnter={() => setActive(i)}
                            >
                                <span className="top">
                                    <span className="name">
                                        #{p.id} · {p.customerName}
                                    </span>
                                    <ProjectStatusPill status={p.status} />
                                </span>
                                <span className="addr">{p.address}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
