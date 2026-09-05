import { Link } from "@tanstack/react-router";
import { MapIcon } from "lucide-react";

import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "#/components/ui/tooltip.tsx";

/*
 * A map tucked into the bottom corner of the home screen, pointing at the
 * roadmap. It sits barely tinted so it reads as part of the background, then
 * straightens up and brightens when you find it.
 */
export function RoadmapMap() {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Link
					to="/roadmap"
					aria-label="Roadmap"
					className="text-primary/15 hover:text-primary/70 focus-visible:ring-ring focus-visible:text-primary/70 absolute right-4 bottom-4 -rotate-12 rounded-md transition-[color,rotate,scale] duration-300 hover:-rotate-3 hover:scale-110 focus-visible:-rotate-3 focus-visible:scale-110 focus-visible:ring-2 focus-visible:outline-none motion-reduce:transition-none sm:right-10 sm:bottom-10"
				>
					<MapIcon className="size-14 sm:size-16" strokeWidth={1.25} />
				</Link>
			</TooltipTrigger>
			<TooltipContent side="top">what's coming</TooltipContent>
		</Tooltip>
	);
}
