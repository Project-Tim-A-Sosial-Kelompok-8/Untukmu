import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api/client";

interface ListedUser {
  id: string;
  email: string;
  display_name: string;
  role: "admin" | "user";
  created_at: string;
  message_count: number;
  messages_by_visibility: { private: number; public_anon: number; unlisted: number };
}
interface UsersPage {
  total: number;
  items: ListedUser[];
}

export function AdminUsers() {
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 25;
  const result = useQuery({
    queryKey: ["admin-users", search, offset],
    queryFn: () =>
      api<UsersPage>(
        "/admin/users?offset=" + offset + "&limit=" + limit + "&q=" + encodeURIComponent(search),
      ),
    staleTime: 0,
  });
  const total = result.data?.total || 0;
  return (
    <section aria-labelledby="admin-users-title">
      <div className="um-admin-section-head">
        <div>
          <h2 className="um-h2" id="admin-users-title">
            Pengguna terdaftar
          </h2>
          <p className="um-admin-subtitle">
            Lihat nama, surel, tanggal pendaftaran, dan jumlah pesan tersimpan setiap akun.
          </p>
        </div>
        <span className="um-admin-status">
          {total.toLocaleString("id-ID")} akun{search ? " ditemukan" : " terdaftar"}
        </span>
      </div>
      <form
        className="um-admin-search"
        onSubmit={(event) => {
          event.preventDefault();
          const next = input.trim();
          if (next === search && offset === 0) void result.refetch();
          setSearch(next);
          setOffset(0);
        }}
      >
        <div className="um-field">
          <label className="um-label" htmlFor="admin-user-search">
            Cari pengguna
          </label>
          <input
            className="um-input"
            id="admin-user-search"
            type="search"
            value={input}
            maxLength={254}
            placeholder="Cari nama atau alamat surel"
            onChange={(event) => setInput(event.target.value)}
          />
        </div>
        <button className="um-btn primary" disabled={result.isFetching}>
          Cari
        </button>
        {search && (
          <button
            type="button"
            className="um-btn"
            onClick={() => {
              setInput("");
              setSearch("");
              setOffset(0);
            }}
          >
            Hapus pencarian
          </button>
        )}
      </form>
      <p className="um-admin-callout">
        Jumlah pesan per akun mencakup seluruh waktu dan semua pilihan privasi. Satu pesan dengan
        beberapa tujuan tetap dihitung satu kali. Daftar ini tidak menampilkan isi pesan, kata
        sandi, atau kunci enkripsi.
      </p>
      {result.error && (
        <p className="um-error" role="alert">
          {result.error.message}
        </p>
      )}
      {result.isPending && (
        <p className="um-admin-empty" role="status">
          Memuat pengguna…
        </p>
      )}
      {result.data && (
        <div className="um-admin-table-wrap">
          <table className="um-admin-users-table">
            <caption className="um-admin-sr-only">
              Daftar pengguna terdaftar dan jumlah pesan tersimpan sepanjang waktu
            </caption>
            <thead>
              <tr>
                <th scope="col">Nama</th>
                <th scope="col">Surel</th>
                <th scope="col">Peran</th>
                <th scope="col">Terdaftar</th>
                <th scope="col">Pesan tersimpan</th>
              </tr>
            </thead>
            <tbody>
              {result.data.items.map((user) => (
                <tr key={user.id}>
                  <td data-label="Nama">
                    <strong>{user.display_name || "Tanpa nama"}</strong>
                  </td>
                  <td data-label="Surel" className="um-admin-user-email">
                    {user.email}
                  </td>
                  <td data-label="Peran">
                    <span
                      className={"um-admin-status " + (user.role === "admin" ? "is-admin" : "")}
                    >
                      {user.role === "admin" ? "Admin" : "Pengguna"}
                    </span>
                  </td>
                  <td data-label="Terdaftar">
                    {new Date(user.created_at).toLocaleDateString("id-ID", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td data-label="Pesan tersimpan">
                    <strong className="um-admin-user-count">
                      {user.message_count.toLocaleString("id-ID")}
                    </strong>
                    <small className="um-admin-count-detail">
                      {user.messages_by_visibility.public_anon} publik ·{" "}
                      {user.messages_by_visibility.private} privat ·{" "}
                      {user.messages_by_visibility.unlisted} tautan terbatas
                    </small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {result.data.items.length === 0 && (
            <div className="um-admin-empty">
              <h3 className="um-h3">
                {search ? "Tidak ada pengguna yang cocok." : "Belum ada pengguna terdaftar."}
              </h3>
              <p className="um-muted">
                {search
                  ? "Coba nama atau alamat surel lain."
                  : "Akun baru akan muncul setelah pendaftaran berhasil."}
              </p>
            </div>
          )}
        </div>
      )}
      <div className="um-admin-pagination">
        <span className="um-muted">
          {total
            ? offset + 1 + "–" + Math.min(offset + limit, total) + " dari " + total + " akun"
            : "0 akun"}
        </span>
        <div className="um-btn-row">
          <button
            className="um-btn"
            disabled={!offset || result.isFetching}
            onClick={() => setOffset(Math.max(0, offset - limit))}
          >
            Sebelumnya
          </button>
          <button
            className="um-btn"
            disabled={offset + limit >= total || result.isFetching}
            onClick={() => setOffset(offset + limit)}
          >
            Berikutnya
          </button>
        </div>
      </div>
    </section>
  );
}
