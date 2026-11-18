import { Link } from 'react-router-dom';
import Button from 'react-bootstrap/Button';
import { faBug } from '@fortawesome/free-solid-svg-icons';
import { api } from '../api';
import { useLoad } from '../hooks';
import { formatDateTime } from '../format';
import { EmptyState, LoadError, PageLoader } from '../components/ui';

// Super user: problems people reported with "Report a problem".
export function ReportsPage() {
    const { data, error, reload } = useLoad(() => api.get('/reports'));

    const setResolved = async (report, resolved) => {
        await api.patch(`/reports/${report.id}`, { resolved });
        reload();
    };

    if (error) return <LoadError error={error} onRetry={reload} />;
    if (!data) return <PageLoader />;
    const open = data.filter((r) => !r.resolvedAt).length;

    return (
        <>
            <div className="page-header">
                <div>
                    <div className="eyebrow">Admin</div>
                    <h1>Problem reports</h1>
                    <div className="text-muted mt-1">
                        {open} open · sent with &ldquo;Report a problem&rdquo;
                    </div>
                </div>
            </div>

            {data.length === 0 ? (
                <section className="panel">
                    <EmptyState icon={faBug}>No problems reported.</EmptyState>
                </section>
            ) : (
                <div className="report-list">
                    {data.map((r) => (
                        <section
                            key={r.id}
                            className={`panel report ${r.resolvedAt ? 'resolved' : ''}`}
                        >
                            <div className="report-head">
                                <div>
                                    <strong>{r.reportedBy}</strong>
                                    <span className="text-muted">
                                        {' '}
                                        · {formatDateTime(r.createdAt)} · on{' '}
                                        <Link to={r.page}>{r.page}</Link>
                                    </span>
                                </div>
                                <Button
                                    size="sm"
                                    variant={
                                        r.resolvedAt
                                            ? 'outline-secondary'
                                            : 'outline-success'
                                    }
                                    onClick={() =>
                                        setResolved(r, !r.resolvedAt)
                                    }
                                >
                                    {r.resolvedAt ? 'Reopen' : 'Mark resolved'}
                                </Button>
                            </div>
                            <p className="report-body">{r.description}</p>
                            {r.hasScreenshot && (
                                <a
                                    className="report-thumb"
                                    href={`/api/reports/${r.id}/screenshot`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title="Open full size in a new tab"
                                >
                                    <img
                                        src={`/api/reports/${r.id}/screenshot`}
                                        alt={`Screenshot from ${r.reportedBy}`}
                                        loading="lazy"
                                    />
                                </a>
                            )}
                            {r.resolvedAt && (
                                <div className="small text-muted">
                                    Resolved {formatDateTime(r.resolvedAt)}
                                </div>
                            )}
                        </section>
                    ))}
                </div>
            )}
        </>
    );
}
