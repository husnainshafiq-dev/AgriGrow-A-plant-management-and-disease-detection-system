import { useEffect, useRef } from "react";

export default function PriceChart({ data, width = 600, height = 300 }) {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // Clear canvas
        ctx.clearRect(0, 0, width, height);

        if (!data || data.length === 0) {
            // Render "No Data" placeholder
            ctx.fillStyle = "#94a3b8";
            ctx.font = "14px 'Outfit', sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("No price history data available", width / 2, height / 2);
            return;
        }

        // Draw margins
        const padding = { top: 20, right: 20, bottom: 40, left: 60 };
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;

        // Get min & max values
        const prices = data.map(d => d.price?.average || d.price || 0);
        const maxPrice = Math.max(...prices) * 1.1;
        const minPrice = Math.max(0, Math.min(...prices) * 0.9);
        const priceRange = maxPrice - minPrice;

        // Draw axes
        ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
        ctx.lineWidth = 1;
        
        // Y-axis gridlines & labels
        const gridLines = 4;
        ctx.fillStyle = "#94a3b8";
        ctx.font = "10px 'Inter', sans-serif";
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";

        for (let i = 0; i <= gridLines; i++) {
            const ratio = i / gridLines;
            const y = padding.top + chartHeight - ratio * chartHeight;
            const value = minPrice + ratio * priceRange;

            // Draw line
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(width - padding.right, y);
            ctx.stroke();

            // Draw label
            ctx.fillText(`₨ ${Math.round(value)}`, padding.left - 10, y);
        }

        // Calculate coordinate mapping functions
        const getX = (index) => {
            if (data.length <= 1) return padding.left + chartWidth / 2;
            return padding.left + (index / (data.length - 1)) * chartWidth;
        };

        const getY = (price) => {
            if (priceRange === 0) return padding.top + chartHeight / 2;
            return padding.top + chartHeight - ((price - minPrice) / priceRange) * chartHeight;
        };

        // Draw Area Fill under the line
        ctx.beginPath();
        ctx.moveTo(getX(0), padding.top + chartHeight);
        data.forEach((d, idx) => {
            ctx.lineTo(getX(idx), getY(d.price?.average || d.price || 0));
        });
        ctx.lineTo(getX(data.length - 1), padding.top + chartHeight);
        ctx.closePath();

        const areaGradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartHeight);
        areaGradient.addColorStop(0, "rgba(16, 185, 129, 0.25)");
        areaGradient.addColorStop(1, "rgba(16, 185, 129, 0.0)");
        ctx.fillStyle = areaGradient;
        ctx.fill();

        // Draw Line
        ctx.beginPath();
        data.forEach((d, idx) => {
            const x = getX(idx);
            const y = getY(d.price?.average || d.price || 0);
            if (idx === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });

        ctx.strokeStyle = "#10b981";
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Draw Data Dots
        data.forEach((d, idx) => {
            const x = getX(idx);
            const y = getY(d.price?.average || d.price || 0);

            ctx.beginPath();
            ctx.arc(x, y, 4, 0, 2 * Math.PI);
            ctx.fillStyle = "#f8fafc";
            ctx.fill();
            ctx.strokeStyle = "#10b981";
            ctx.lineWidth = 2;
            ctx.stroke();
        });

        // Draw X-axis labels
        ctx.fillStyle = "#94a3b8";
        ctx.font = "9px 'Inter', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";

        const labelStep = Math.max(1, Math.floor(data.length / 5));
        data.forEach((d, idx) => {
            if (idx % labelStep === 0) {
                const dateStr = new Date(d.date).toLocaleDateString(undefined, { month: "short", day: "numeric" });
                ctx.fillText(dateStr, getX(idx), padding.top + chartHeight + 10);
            }
        });

    }, [data, width, height]);

    return (
        <div className="canvas-chart-wrapper" style={{ width: "100%", overflowX: "auto" }}>
            <canvas
                ref={canvasRef}
                width={width}
                height={height}
                style={{
                    display: "block",
                    margin: "0 auto",
                    maxWidth: "100%",
                    background: "rgba(15, 23, 42, 0.35)",
                    borderRadius: "16px",
                    border: "1px solid rgba(255, 255, 255, 0.05)"
                }}
            />
        </div>
    );
}
