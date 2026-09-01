import { Badge } from "#/components/ui/badge.tsx";
import { Skeleton } from "#/components/ui/skeleton.tsx";
import { useOnlinePlayers } from "#/hooks/use-online-players.ts";

export function OnlineCount() {
	const count = useOnlinePlayers();

	if (count === null) {
		return <Skeleton className="h-5 w-24 rounded-full" />;
	}

	return (
		<Badge variant="outline" className="gap-1.5">
			<span className="relative flex size-1.5">
				<span className="bg-primary absolute inline-flex size-full animate-ping rounded-full opacity-75" />
				<span className="bg-primary relative inline-flex size-full rounded-full" />
			</span>
			<span className="tabular-nums">{count.toLocaleString()}</span> online
		</Badge>
	);
}
