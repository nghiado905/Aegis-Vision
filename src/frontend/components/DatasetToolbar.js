export function DatasetToolbar() {
  return `<div class="row" id="dataset-tools"><label class="btn quiet">Upload images<input type="file" accept="image/*" multiple hidden></label><button class="btn quiet" data-action="inferProject">Infer model</button><button class="btn quiet" data-action="quality">Check labels</button><button class="btn quiet" data-action="exportProject">Export ZIP</button></div>`;
}
