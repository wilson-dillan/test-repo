import PropTypes from 'prop-types';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Line,
    LineChart,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { parseDate } from '../format';

// Validated with the dataviz palette checker (CVD-safe pair, both within
// the lightness band). To Do is under 3:1 contrast on white, so every chart
// also states the counts in its legend and tooltip.
const DONE = '#1D5BA8';
const TODO = '#1FA6D6';
const EMPTY = '#E1E7EF';
const AXIS = { fill: '#5C6B80', fontSize: 12 };

// Categorical colors from the dataviz reference palette, checked with its
// validator (all pairs pass the color-blind and normal-vision floors).
// Yellow and pink are under 3:1 on white, so the legend under the pie
// names every status with its count.
const STATUS_COLORS = {
    todo: '#2A78D6',
    in_progress: '#EDA100',
    submitted: '#E87BA4',
    done: '#008300',
};
const APPLICATIONS = '#2A78D6';
const OPEN_TASKS = '#EB6834';
const GRID = '#E1E7EF';

// Chart click -> onSelect(id of the clicked column's row).
function selectColumn(state, data, onSelect) {
    // A click between columns reports no column at all (null).
    const index = state?.activeIndex ?? state?.activeTooltipIndex;
    if (index === null || index === undefined || !onSelect) return;
    const row = data[Number(index)];
    if (row) onSelect(row.id);
}

const shortDate = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
});

function Legend({ items }) {
    return (
        <div className="chart-legend">
            {items.map((item) => (
                <span key={item.label}>
                    <span
                        className="swatch"
                        style={{ background: item.color }}
                    />
                    {item.label}
                    {item.value !== undefined && <strong>{item.value}</strong>}
                </span>
            ))}
        </div>
    );
}

Legend.propTypes = { items: PropTypes.array.isRequired };

function ChartTooltip({ active, payload, title }) {
    if (!active || !payload?.length) return null;
    return (
        <div className="chart-tooltip">
            {title && <div className="title">{title(payload[0].payload)}</div>}
            {payload.map((p) => (
                <p className="row" key={p.name}>
                    <span
                        className="swatch"
                        style={{ background: p.color || p.payload.fill }}
                    />
                    {p.name}: <strong>{p.value}</strong>
                </p>
            ))}
        </div>
    );
}

ChartTooltip.propTypes = {
    active: PropTypes.bool,
    payload: PropTypes.array,
    title: PropTypes.func,
};

export function DonutChart({ done, todo, height = 220, label = 'done' }) {
    const total = done + todo;
    const percent = total ? Math.round((done / total) * 100) : 0;
    const data = total
        ? [
              { name: 'Done', value: done, fill: DONE },
              { name: 'To Do', value: todo, fill: TODO },
          ].filter((d) => d.value > 0)
        : [{ name: 'None', value: 1, fill: EMPTY }];

    return (
        <div>
            <div
                className="donut"
                style={{ height }}
                role="img"
                aria-label={`${done} of ${total} ${label}, ${percent} percent`}
            >
                <ResponsiveContainer>
                    <PieChart>
                        <Pie
                            data={data}
                            dataKey="value"
                            nameKey="name"
                            innerRadius="70%"
                            outerRadius="100%"
                            startAngle={90}
                            endAngle={-270}
                            stroke="#fff"
                            strokeWidth={data.length > 1 ? 2 : 0}
                            cornerRadius={data.length > 1 ? 4 : 0}
                            isAnimationActive={false}
                        >
                            {data.map((d) => (
                                <Cell key={d.name} fill={d.fill} />
                            ))}
                        </Pie>
                        {total > 0 && <Tooltip content={<ChartTooltip />} />}
                    </PieChart>
                </ResponsiveContainer>
                <div className="center">
                    <div className="value">{percent}%</div>
                    <div className="label">
                        {done} of {total} {label}
                    </div>
                </div>
            </div>
            <div className="d-flex justify-content-center mt-3">
                <Legend
                    items={[
                        { label: 'Done', color: DONE, value: done },
                        { label: 'To Do', color: TODO, value: todo },
                    ]}
                />
            </div>
        </div>
    );
}

DonutChart.propTypes = {
    done: PropTypes.number.isRequired,
    todo: PropTypes.number.isRequired,
    height: PropTypes.number,
    label: PropTypes.string,
};

// Per person: applications they own and tasks assigned to them that are
// still open. Clicking a person's column calls onSelect(user id); the
// selected person stays bright and the others fade.
export function UserWorkloadChart({ users, selectedId, onSelect }) {
    const data = users.map((u) => ({
        id: u.id,
        name: u.name,
        'Applications owned': u.applications,
        'Open tasks': u.openTasks,
    }));
    return (
        <div>
            <Legend
                items={[
                    { label: 'Applications owned', color: APPLICATIONS },
                    { label: 'Open tasks', color: OPEN_TASKS },
                ]}
            />
            <div style={{ height: 280 }} className="mt-2">
                <ResponsiveContainer>
                    <BarChart
                        data={data}
                        margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
                        barGap={2}
                        onClick={(e) => selectColumn(e, data, onSelect)}
                        style={onSelect ? { cursor: 'pointer' } : undefined}
                    >
                        <CartesianGrid vertical={false} stroke={GRID} />
                        <XAxis
                            dataKey="name"
                            tick={AXIS}
                            tickLine={false}
                            axisLine={{ stroke: GRID }}
                            interval={0}
                            tickFormatter={(name) =>
                                name.length > 12
                                    ? `${name.slice(0, 11)}…`
                                    : name
                            }
                        />
                        <YAxis
                            allowDecimals={false}
                            tick={AXIS}
                            tickLine={false}
                            axisLine={false}
                        />
                        <Tooltip
                            cursor={{ fill: 'rgba(29, 91, 168, 0.06)' }}
                            content={<ChartTooltip title={(d) => d.name} />}
                        />
                        {[
                            ['Applications owned', APPLICATIONS],
                            ['Open tasks', OPEN_TASKS],
                        ].map(([key, color]) => (
                            <Bar
                                key={key}
                                dataKey={key}
                                fill={color}
                                radius={[4, 4, 0, 0]}
                                maxBarSize={22}
                                isAnimationActive={false}
                            >
                                {data.map((d) => (
                                    <Cell
                                        key={d.id}
                                        fillOpacity={
                                            selectedId == null ||
                                            selectedId === d.id
                                                ? 1
                                                : 0.3
                                        }
                                    />
                                ))}
                            </Bar>
                        ))}
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}

UserWorkloadChart.propTypes = {
    users: PropTypes.array.isRequired,
    selectedId: PropTypes.number,
    onSelect: PropTypes.func,
};

// How many active applications are at each stage. Clicking a slice (or
// its legend entry) calls onSelect(status).
export function ApplicationStatusChart({ counts, onSelect }) {
    const total = counts.reduce((n, c) => n + c.count, 0);
    const data = counts.filter((c) => c.count > 0);
    return (
        <div>
            <div style={{ height: 230 }}>
                <ResponsiveContainer>
                    <PieChart>
                        <Pie
                            data={total ? data : [{ label: 'None', count: 1 }]}
                            dataKey="count"
                            nameKey="label"
                            outerRadius="90%"
                            stroke="#fff"
                            strokeWidth={2}
                            isAnimationActive={false}
                            onClick={(d) =>
                                onSelect?.(d.payload?.status ?? d.status)
                            }
                            cursor={onSelect ? 'pointer' : undefined}
                        >
                            {(total ? data : [{ status: 'none' }]).map((d) => (
                                <Cell
                                    key={d.status}
                                    fill={STATUS_COLORS[d.status] || EMPTY}
                                />
                            ))}
                        </Pie>
                        {total > 0 && (
                            <Tooltip
                                content={
                                    <ChartTooltip title={(d) => d.label} />
                                }
                            />
                        )}
                    </PieChart>
                </ResponsiveContainer>
            </div>
            <div className="chart-legend status-legend mt-2">
                {counts.map((c) => (
                    <button
                        type="button"
                        key={c.status}
                        onClick={() => onSelect?.(c.status)}
                    >
                        <span
                            className="swatch"
                            style={{ background: STATUS_COLORS[c.status] }}
                        />
                        {c.label}
                        <strong>{c.count}</strong>
                    </button>
                ))}
            </div>
        </div>
    );
}

ApplicationStatusChart.propTypes = {
    counts: PropTypes.array.isRequired,
    onSelect: PropTypes.func,
};

// A single-series line over dates ('YYYY-MM-DD'), one point per period.
function TrendLineChart({ data, dataKey, title, height = 240 }) {
    const label = (date) => shortDate.format(parseDate(date));
    return (
        <div style={{ height }}>
            <ResponsiveContainer>
                <LineChart
                    data={data}
                    margin={{ top: 12, right: 16, left: -12, bottom: 0 }}
                >
                    <CartesianGrid vertical={false} stroke={GRID} />
                    <XAxis
                        dataKey="date"
                        tick={AXIS}
                        tickLine={false}
                        axisLine={{ stroke: GRID }}
                        tickFormatter={label}
                        minTickGap={12}
                    />
                    <YAxis
                        allowDecimals={false}
                        tick={AXIS}
                        tickLine={false}
                        axisLine={false}
                    />
                    <Tooltip
                        cursor={{ stroke: GRID, strokeWidth: 1 }}
                        content={
                            <ChartTooltip title={(d) => title(label(d.date))} />
                        }
                    />
                    <Line
                        type="linear"
                        dataKey={dataKey}
                        stroke={DONE}
                        strokeWidth={2}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        dot={{
                            r: data.length > 20 ? 3 : 4,
                            fill: DONE,
                            stroke: '#fff',
                            strokeWidth: 2,
                        }}
                        activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }}
                        isAnimationActive={false}
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}

TrendLineChart.propTypes = {
    data: PropTypes.array.isRequired,
    dataKey: PropTypes.string.isRequired,
    title: PropTypes.func.isRequired,
    height: PropTypes.number,
};

// Rebates received each week (by the date the rebate arrived).
export function RebatesByWeekChart({ weeks }) {
    return (
        <TrendLineChart
            data={weeks.map((w) => ({
                date: w.week,
                'Rebates received': w.received,
            }))}
            dataKey="Rebates received"
            title={(date) => `Week of ${date}`}
        />
    );
}

RebatesByWeekChart.propTypes = { weeks: PropTypes.array.isRequired };

// One person's count per day, e.g. tasks they completed.
export function DailyLineChart({ days, field, name }) {
    return (
        <TrendLineChart
            data={days.map((d) => ({ date: d.day, [name]: d[field] }))}
            dataKey={name}
            title={(date) => date}
            height={200}
        />
    );
}

DailyLineChart.propTypes = {
    days: PropTypes.array.isRequired,
    field: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
};

// One row per application: a bar of its documents, uploaded vs missing.
export function PriorityChart({ ranked, onOpen, formatAge }) {
    return (
        <div>
            <Legend
                items={[
                    { label: 'Uploaded', color: DONE },
                    { label: 'Missing', color: EMPTY },
                ]}
            />
            <ol className="priority-list mt-2">
                {ranked.map((p, i) => (
                    <li key={p.id}>
                        <button
                            type="button"
                            onClick={() => onOpen(p)}
                            title={`${p.taskDone} of ${p.taskTotal} documents uploaded · ${formatAge(p.age)}`}
                        >
                            <span className="rank">{i + 1}</span>
                            <span className="who">
                                <span className="name">{p.customerName}</span>
                                <span className="meta">
                                    #{p.id} · {p.typeLabel} · {formatAge(p.age)}
                                </span>
                            </span>
                            <span
                                className="docs"
                                role="img"
                                aria-label={`${p.taskDone} of ${p.taskTotal} documents uploaded`}
                            >
                                {Array.from({ length: p.taskTotal }, (_, k) => (
                                    <span
                                        key={k}
                                        style={{
                                            background:
                                                k < p.taskDone ? DONE : EMPTY,
                                        }}
                                    />
                                ))}
                            </span>
                            <span className="count">
                                {p.taskDone}/{p.taskTotal}
                            </span>
                        </button>
                    </li>
                ))}
            </ol>
        </div>
    );
}

PriorityChart.propTypes = {
    ranked: PropTypes.array.isRequired,
    onOpen: PropTypes.func.isRequired,
    formatAge: PropTypes.func.isRequired,
};
