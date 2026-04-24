# Google Trans Obsidian

UI version: `0.1.0`

Obsidian plugin dịch toàn bộ note hiện tại bằng Google Translate web endpoint.

## Tính năng

- Bấm ribbon icon hoặc chạy command để dịch note hiện tại.
- Mặc định tạo file mới dạng `ten-note.vi.md`.
- Không cần API key.
- Có 3 chế độ output:
  - `new-file`: tạo file dịch mới
  - `replace`: ghi đè note hiện tại
  - `append`: thêm bản dịch bên dưới note gốc
- Giữ nguyên YAML frontmatter và fenced code block.

## Cài trên mobile bằng BRAT

Repo URL:

`https://github.com/louisalviss/google-trans-obsidian`

Các bước:

1. Trong Obsidian mobile, cài plugin `BRAT` từ Community Plugins.
2. Enable BRAT.
3. Vào BRAT settings.
4. Chọn `Add Beta Plugin`.
5. Dán repo URL ở trên.
6. Add plugin.
7. Quay lại Community Plugins, refresh plugin list, rồi enable `Google Trans Obsidian`.

Lưu ý: BRAT thường dùng GitHub release assets để cài plugin beta. Nếu cài từ repo không chạy, hãy tạo GitHub Release chứa `main.js`, `manifest.json`, `versions.json`, rồi add lại bằng BRAT.

## Cài thủ công

Copy các file này vào:

`<Vault>/.obsidian/plugins/google-trans-obsidian/`

Các file tối thiểu:

- `manifest.json`
- `main.js`

Sau đó reload Obsidian và enable plugin trong Community Plugins.

## Hạn chế

- Dùng Google Translate web endpoint không chính thức.
- Có thể lỗi nếu note quá dài hoặc bị rate limit.
- Không phù hợp dịch hàng loạt số lượng lớn.
