import * as React from 'react';
import renderer, { act } from 'react-test-renderer';

import { MonoText } from '../StyledText';

it(`renders correctly`, () => {
  let testRenderer;
  act(() => {
    testRenderer = renderer.create(<MonoText>Snapshot test!</MonoText>);
  });
  const tree = testRenderer.toJSON();

  expect(tree).toMatchSnapshot();
});
