# 감정 쓰레기통 (Emotion Trash)

나만의 감정 버리기 웹앱. 오늘 힘들었던 일을 노란 포스트잇에 적고, 구겨서 쓰레기통에 드래그해 던지는 인터랙티브 앱.

## 핵심 파일

| 파일 | 역할 |
|------|------|
| `emotion_trash.html` | **메인 앱** — 전체 UI + Supabase 인증/DB 로직 포함 |
| `vercel.json` | Vercel 배포 설정 (루트 URL → emotion_trash.html) |
| `server.js` | 댕냥구조대(pet_match) 백엔드 — 감정 앱과 무관 |

## Supabase 설정 (첫 배포 시 필수)

`emotion_trash.html` 상단 두 줄을 채워야 함:
```js
const SUPABASE_URL      = 'https://xxxx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOi...';
```

### Supabase SQL (한 번만 실행)
```sql
create table emotions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users default auth.uid() not null,
  text text not null,
  created_at timestamptz default now()
);
alter table emotions enable row level security;
create policy "own" on emotions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

### Supabase 대시보드 설정
- Authentication → Providers → Email → **Confirm email OFF**

## 로컬 개발

```bash
# 서버 없이 바로 열기 (Supabase 키 설정 후)
open emotion_trash.html

# 댕냥구조대 서버가 필요한 경우
npm install
node server.js   # http://localhost:3000
```

## 배포

- **GitHub**: `git push origin main` → 자동 반영
- **Vercel**: GitHub 연동 후 자동 배포, Framework = Other
- `vercel.json` 이 루트(`/`)를 `emotion_trash.html`로 라우팅

## 앱 흐름

1. 로그인 / 회원가입 화면
2. 회원가입 성공 → 로그인 탭으로 전환 (자동 로그인 안 함)
3. 로그인 성공 → 메인 화면
4. 포스트잇에 감정 작성 → **구기기** 버튼 클릭 → 종이가 구겨짐
5. 구겨진 볼을 드래그해 쓰레기통에 던지기
6. Supabase `emotions` 테이블에 저장 (유저별 RLS 격리)
7. **버린 감정 보기** 버튼으로 히스토리 확인

## GitHub

레포: `https://github.com/vbnm040909-png/skdus`  
브랜치: `main`
