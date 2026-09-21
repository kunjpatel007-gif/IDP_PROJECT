
import { memo } from 'react';

export default memo(function Backdrop() {
  return (
    <>
      <div className="page-vignette" aria-hidden="true" />
    </>
  );
});
