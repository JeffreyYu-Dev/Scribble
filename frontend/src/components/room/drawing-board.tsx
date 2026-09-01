import { PaletteIcon } from "lucide-react";

import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "#/components/ui/empty.tsx";
import { cn } from "#/lib/utils.ts";

type DrawingBoardProps = {
	/**
	 * The real <canvas>. It is stretched to fill the sheet, so keeping the
	 * bitmap in step with the rendered size stays the canvas's own job.
	 */
	children?: React.ReactNode;
	className?: string;
};

/**
 * The sheet the round is drawn on: a 4:3 page that keeps its ratio while
 * filling whatever room the layout gives it. The paper stays white in both
 * themes — strokes are drawn in ink colours that only read on white — so this
 * is the one surface that does not follow the theme tokens.
 */
export function DrawingBoard({ children, className }: DrawingBoardProps) {
	return (
		<div
			className={cn(
				"relative isolate mx-auto aspect-[4/3] w-full overflow-hidden rounded-lg bg-white ring-1 ring-foreground/10",
				className,
			)}
		>
			{children ?? <BoardPlaceholder />}
		</div>
	);
}

// TODO: remove once the real canvas is mounted as a child of <DrawingBoard>.
function BoardPlaceholder() {
	return (
		<Empty className="absolute inset-0 text-neutral-500">
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<PaletteIcon />
				</EmptyMedia>
				<EmptyTitle className="text-neutral-700">canvas mounts here</EmptyTitle>
				<EmptyDescription className="text-neutral-500">
					Pass your &lt;canvas&gt; as a child of DrawingBoard.
				</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}
