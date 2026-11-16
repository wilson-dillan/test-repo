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
const GRID = '#E1E7EF';

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

export function TasksPerUserChart({ users }) {
    const data = users.map((u) => ({
        name: u.name,
        Done: u.done,
        'To Do': u.total - u.done,
    }));
    return (
        <div>
            <Legend
                items={[
                    { label: 'Done', color: DONE },
                    { label: 'To Do', color: TODO },
                ]}
            />
            <div style={{ height: 280 }} className="mt-2">
                <ResponsiveContainer>
                    <BarChart
                        data={data}
                        margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
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
                        <Bar
                            dataKey="Done"
                            stackId="tasks"
                            fill={DONE}
                            stroke="#fff"
                            strokeWidth={2}
                            maxBarSize={28}
                            isAnimationActive={false}
                        />
                        <Bar
                            dataKey="To Do"
                            stackId="tasks"
                            fill={TODO}
                            stroke="#fff"
                            strokeWidth={2}
                            radius={[4, 4, 0, 0]}
                            maxBarSize={28}
                            isAnimationActive={false}
                        />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}

TasksPerUserChart.propTypes = { users: PropTypes.array.isRequired };

export function WeeklyCompletionsChart({ weeks }) {
    const data = weeks.map((w) => ({
        week: w.week,
        'Projects completed': w.completed,
    }));
    const label = (week) => shortDate.format(parseDate(week));
    return (
        <div style={{ height: 240 }}>
            <ResponsiveContainer>
                <LineChart
                    data={data}
                    margin={{ top: 12, right: 16, left: -12, bottom: 0 }}
                >
                    <CartesianGrid vertical={false} stroke={GRID} />
                    <XAxis
                        dataKey="week"
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
                            <ChartTooltip
                                title={(d) => `Week of ${label(d.week)}`}
                            />
                        }
                    />
                    <Line
                        type="linear"
                        dataKey="Projects completed"
                        stroke={DONE}
                        strokeWidth={2}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        dot={{
                            r: 4,
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

WeeklyCompletionsChart.propTypes = { weeks: PropTypes.array.isRequired };
