# v2 設計書

設計書全文は `/mnt/user-data/outputs/design_v2.md` または Claude チャット（セッション10）を参照してください。

## 主な変更点

- 全員が個人として参加（名前入力のみ）
- 個人戦/チーム戦はホスト画面で選択
- 同時プレイモード対応
- チーム戦は全員一致/誰か1人モード選択可能
- 最大100人同時参加
- もう一度プレイ機能
- 先生によるゲーム強制終了

## ロビーの2段階フロー

```
個人戦: コード入力 → 個人戦ロビー → ゲーム開始
チーム戦: コード入力 → 個人戦ロビー → チーム編成 → チーム戦ロビー → ゲーム開始
```

## DB変更

- 新テーブル: `players`, `player_answers`
- `game_sessions` に `play_mode`, `progress_mode`, `answer_rule`, `max_players`, `team_count` 追加
- `teams` に `is_individual` 追加
- `status` に `team_forming` 追加
