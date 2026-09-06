/* 1. stateへ追加: calFilter:'all' */
/* 例: const S={ ..., calFilter:'all', ... }; */

/* 2. renderCalendar() 冒頭で、レビュー一覧を絞り込む */
const calendarReviews = S.calFilter === 'all'
  ? S.reviews
  : S.reviews.filter(review => review.type === S.calFilter);

/* 3. renderCalendar() 内の日付件数・選択日抽出で S.reviews ではなく calendarReviews を使う */
/* count = calendarReviews.filter(review => reviewDate(review) === key).length; */
/* selected = calendarReviews.filter(review => reviewDate(review) === S.selectedDate); */

/* 4. イベント登録へ追加 */
document.querySelectorAll('.calendar-filter').forEach(button => {
  button.addEventListener('click', () => {
    S.calFilter = button.dataset.calendarFilter;
    document.querySelectorAll('.calendar-filter').forEach(item => {
      item.classList.toggle('active', item === button);
    });
    renderCalendar();
  });
});
