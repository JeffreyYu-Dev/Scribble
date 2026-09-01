import { useEffect, useRef } from "react";

/** The bitmap's fixed size. CSS stretches the element to fit the board. */
const WIDTH = 1600;
const HEIGHT = 1200;

/** Coordinates are in bitmap pixels, not CSS pixels. */
function drawDot(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	radius = 8,
	color = "#000",
) {
	ctx.beginPath();
	ctx.arc(x, y, radius, 0, Math.PI * 2);
	ctx.fillStyle = color;
	ctx.fill();
}

function Canvas() {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) {
			return;
		}

		const context = canvas.getContext("2d");
		if (!context) {
			return;
		}

		const controller = new AbortController();

		canvas.addEventListener(
			"mousedown",
			(e) => {
				const box = canvas.getBoundingClientRect();
				// The box is whatever size CSS made it; the bitmap is always
				// 1600x1200. Without this ratio a click at the right edge of a
				// 400px-wide board would draw halfway across the bitmap.
				const x = ((e.clientX - box.x) * canvas.width) / box.width;
				const y = ((e.clientY - box.y) * canvas.height) / box.height;

				drawDot(context, x, y);
			},
			{ signal: controller.signal },
		);

		return () => {
			controller.abort();
		};
	}, []);

	return (
		<canvas
			ref={canvasRef}
			width={WIDTH}
			height={HEIGHT}
			className="w-full h-full "
		/>
	);
}

export { Canvas };
