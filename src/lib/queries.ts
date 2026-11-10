import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Me, Page, PersonCard, PersonDetail, PopularTags, TeamDetail, TeamSummary } from "@shared/api-types";
import type { OnboardingInput, ProfileUpdateInput, TeamInput } from "@shared/schemas";
import { api, ApiRequestError, qs } from "./api";

export const keys = {
  me: ["me"] as const,
  people: (f: object) => ["people", f] as const,
  person: (id: string) => ["person", id] as const,
  tags: ["tags"] as const,
  teams: (f: object) => ["teams", f] as const,
  team: (id: string) => ["team", id] as const,
};

/** Current user + profile. `null` when signed out (401 is not an error here). */
export function useMe() {
  return useQuery({
    queryKey: keys.me,
    queryFn: async () => {
      try {
        return await api<Me>("/api/me");
      } catch (e) {
        if (e instanceof ApiRequestError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 60_000,
  });
}

export type PublicConfig = { emailEnabled: boolean; supportUrl: string | null };
export const useConfig = () => useQuery({ queryKey: ["config"], queryFn: () => api<PublicConfig>("/api/config"), staleTime: 10 * 60_000 });

export type PeopleFilters = { q?: string; skills?: string[]; interests?: string[]; roles?: string[]; availability?: string; graduationYear?: string; sort?: "match" | "recent"; page?: number };

export const usePeople = (f: PeopleFilters) =>
  useQuery({ queryKey: keys.people(f), queryFn: () => api<Page<PersonCard>>(`/api/people${qs(f)}`), placeholderData: keepPreviousData, staleTime: 30_000 });

export const usePerson = (id: string) => useQuery({ queryKey: keys.person(id), queryFn: () => api<PersonDetail>(`/api/people/${id}`), retry: (n, e) => !(e instanceof ApiRequestError && e.status === 404) && n < 2 });

export const usePopularTags = () => useQuery({ queryKey: keys.tags, queryFn: () => api<PopularTags>("/api/people/tags"), staleTime: 5 * 60_000 });

export type TeamFilters = { q?: string; skills?: string[]; status?: string; mine?: "1"; page?: number };
export const useTeams = (f: TeamFilters) =>
  useQuery({ queryKey: keys.teams(f), queryFn: () => api<Page<TeamSummary>>(`/api/teams${qs(f)}`), placeholderData: keepPreviousData, staleTime: 30_000 });

export const useTeam = (id: string) => useQuery({ queryKey: keys.team(id), queryFn: () => api<TeamDetail>(`/api/teams/${id}`), enabled: !!id, retry: (n, e) => !(e instanceof ApiRequestError && e.status === 404) && n < 2 });

function useSetMe() {
  const qc = useQueryClient();
  return (me: Me) => {
    qc.setQueryData(keys.me, me);
    qc.invalidateQueries({ queryKey: ["people"] });
    qc.invalidateQueries({ queryKey: ["person"] });
  };
}

export function useOnboard() {
  const setMe = useSetMe();
  return useMutation({ mutationFn: (input: OnboardingInput) => api<Me>("/api/me/onboarding", { method: "POST", json: input }), onSuccess: setMe });
}

export function useSaveProfile() {
  const setMe = useSetMe();
  return useMutation({ mutationFn: (input: ProfileUpdateInput) => api<Me>("/api/me/profile", { method: "PUT", json: input }), onSuccess: setMe });
}

export function useAvatar() {
  const setMe = useSetMe();
  return useMutation({
    mutationFn: (blob: Blob | null) =>
      blob ? api<Me>("/api/me/avatar", { method: "PUT", body: blob, headers: { "Content-Type": blob.type } }) : api<Me>("/api/me/avatar", { method: "DELETE" }),
    onSuccess: setMe,
  });
}

function useTeamMutation<V>(fn: (v: V) => Promise<TeamDetail | { ok: true }>, teamId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (data) => {
      if (data && "id" in data) qc.setQueryData(keys.team(data.id), data);
      else if (teamId) qc.invalidateQueries({ queryKey: keys.team(teamId) });
      qc.invalidateQueries({ queryKey: ["teams"] });
      qc.invalidateQueries({ queryKey: keys.me });
    },
  });
}

export const useCreateTeam = () => useTeamMutation((input: TeamInput) => api<TeamDetail>("/api/teams", { method: "POST", json: input }));
export const useUpdateTeam = (id: string) => useTeamMutation((input: TeamInput) => api<TeamDetail>(`/api/teams/${id}`, { method: "PATCH", json: input }), id);
export const useDeleteTeam = (id: string) => useTeamMutation(() => api<{ ok: true }>(`/api/teams/${id}`, { method: "DELETE" }), id);
export const useRequestJoin = (id: string) => useTeamMutation((message: string) => api<TeamDetail>(`/api/teams/${id}/requests`, { method: "POST", json: { message } }), id);
export const useWithdraw = (id: string) => useTeamMutation(() => api<TeamDetail>(`/api/teams/${id}/requests/mine`, { method: "DELETE" }), id);
export const useDecide = (id: string) =>
  useTeamMutation((v: { requestId: string; decision: "accept" | "decline" }) => api<TeamDetail>(`/api/teams/${id}/requests/${v.requestId}`, { method: "POST", json: { decision: v.decision } }), id);
export const useLeave = (id: string) => useTeamMutation(() => api<{ ok: true }>(`/api/teams/${id}/leave`, { method: "POST" }), id);
export const useRemoveMember = (id: string) => useTeamMutation((userId: string) => api<TeamDetail>(`/api/teams/${id}/members/${userId}`, { method: "DELETE" }), id);
