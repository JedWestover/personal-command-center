import Dashboard from "@/components/dashboard";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function Home() {
	const session = await auth();

	if (!session?.user) {
		redirect("/api/auth/signin");
	}

	const userName = session.user.name?.trim().split(/\s+/)[0] ?? session.user.email ?? "there";

	return <Dashboard userName={userName} />;
}
