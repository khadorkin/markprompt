import * as Slider from '@radix-ui/react-slider';
import cn from 'classnames';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';

import { TeamSettingsLayout } from '@/components/layouts/TeamSettingsLayout';
import Button from '@/components/ui/Button';
import { ListItem } from '@/components/ui/ListItem';
import { Segment } from '@/components/ui/Segment';
import { cancelSubscription } from '@/lib/api';
import useTeam from '@/lib/hooks/use-team';
import { getStripe } from '@/lib/stripe/client';
import {
  comparePlans,
  getTierDetailsFromPriceId,
  getTierFromPriceId,
  isYearlyPrice,
  PricedModel,
  Tier,
  TIERS,
} from '@/lib/stripe/tiers';

const env =
  process.env.NEXT_PUBLIC_VERCEL_ENV === 'production' ? 'production' : 'test';

const PricingCard = ({
  tier,
  isStandard,
  currentPriceId,
  isEnterprisePlan,
  customPrice,
  cta,
  ctaHref,
}: {
  tier: Tier;
  model: PricedModel;
  isStandard?: boolean;
  currentPriceId?: string;
  isEnterprisePlan?: boolean;
  customPrice?: string;
  cta?: string;
  ctaHref?: string;
}) => {
  const router = useRouter();
  const { team, mutate: mutateTeam } = useTeam();

  const tierDetails = TIERS[tier];
  const [loading, setLoading] = useState(false);
  const hasMonthlyOption =
    tierDetails.prices && tierDetails.prices?.some((p) => p.price?.monthly);

  const [showAnnual, setShowAnnual] = useState<boolean | undefined>(undefined);
  const [priceStep, setPriceStep] = useState<number>(-1);

  useEffect(() => {
    const initialPriceStep = Math.max(
      0,
      tierDetails.prices?.findIndex(
        (p) =>
          p.price?.monthly?.priceIds[env] === currentPriceId ||
          p.price?.yearly?.priceIds[env] === currentPriceId,
      ) || 0,
    );

    const annual =
      !currentPriceId || !!(currentPriceId && isYearlyPrice(currentPriceId));
    setPriceStep(initialPriceStep);
    setShowAnnual(annual);
  }, [currentPriceId, hasMonthlyOption, tierDetails.prices]);

  const quotas =
    priceStep > -1 ? tierDetails.prices[priceStep].quota : undefined;
  const quotaModels = (quotas ? Object.keys(quotas) : []) as PricedModel[];

  const priceIdsAndAmount =
    priceStep > -1
      ? tierDetails.prices[priceStep].price?.[
          showAnnual || !hasMonthlyOption ? 'yearly' : 'monthly'
        ]
      : undefined;
  const amount = priceIdsAndAmount?.amount || 0;
  const priceId = priceIdsAndAmount?.priceIds[env];
  const isFree = amount === 0 && !tierDetails.enterprise;

  let isCurrentPlan = false;
  if (!currentPriceId) {
    // Free and Enterprise do not have any price ids attached
    if (isEnterprisePlan && tierDetails.enterprise) {
      isCurrentPlan = true;
    } else if (!tierDetails.enterprise) {
      isCurrentPlan = priceId === undefined;
    }
  } else {
    isCurrentPlan = priceId === currentPriceId;
  }

  let buttonLabel = 'Upgrade';
  if (cta) {
    buttonLabel = cta;
  } else if (isCurrentPlan) {
    buttonLabel = 'Current plan';
  } else if (isFree) {
    buttonLabel = 'Downgrade';
  } else if (priceId && currentPriceId) {
    const comp = comparePlans(priceId, currentPriceId);
    if (comp === 0) {
      buttonLabel = 'Update';
    } else if (comp === -1) {
      buttonLabel = 'Downgrade';
    }
  }

  let isHighlighted = false;
  if (isStandard && !currentPriceId) {
    // If we are on a free plan, highlight Standard
    isHighlighted = true;
  } else if (isCurrentPlan && !isFree) {
    // If this is the current plan, and it's not Free, highlight
    isHighlighted = true;
  } else if (
    currentPriceId &&
    priceId &&
    getTierFromPriceId(currentPriceId) === getTierFromPriceId(priceId)
  ) {
    // If card priceId and currentPriceId are of the same tier,
    // keep highlighted (e.g. when sliding quota range).
    isHighlighted = true;
  }

  return (
    <div
      className={cn(
        'flex w-full flex-col gap-4 rounded-lg border px-8 pb-8 pt-12',
        {
          'border-neutral-900 bg-neutral-1000/50': isHighlighted,
          'border-transparent': !isHighlighted,
        },
      )}
    >
      <p
        className={cn(
          '-mt-4 w-min whitespace-nowrap rounded-full bg-sky-600/20 px-2 py-0.5 text-xs font-medium text-sky-500 transition duration-300',
          {
            'opacity-0': !isCurrentPlan,
          },
        )}
      >
        Current plan
      </p>
      <div className="flex flex-col items-center gap-2 lg:flex-row">
        <h2 className="flex-none flex-grow truncate text-xl font-semibold text-neutral-300">
          {tierDetails.name}
        </h2>
        {hasMonthlyOption && typeof showAnnual !== 'undefined' && (
          <div className="flex-none">
            <Segment
              size="sm"
              items={['Monthly', 'Annually']}
              selected={showAnnual ? 1 : 0}
              id="billing-period"
              onChange={(i) => setShowAnnual(i === 1)}
            />
          </div>
        )}
        {!hasMonthlyOption && !isFree && (
          <p className="flex-none rounded-md bg-neutral-900 px-2 py-0.5 text-xs font-medium text-neutral-300">
            Billed annually
          </p>
        )}
      </div>
      <div className="flex h-16 w-full">
        {tierDetails.prices && (
          <div className="relative flex w-full flex-col">
            <p className="text-3xl font-semibold text-neutral-300">
              {customPrice ?? (
                <>
                  ${amount}
                  <span className="text-base font-normal text-neutral-700">
                    /month
                  </span>
                </>
              )}
            </p>
            {/* <Flashing active={quotaModels.findIndex((m) => m === model)}>
              {quotaModels.map((model) => {
                return (
                  <p
                    key={`pricing-quota-${tierDetails.name}-${priceStep}-${model}`}
                    className="mt-2 h-8 w-full text-left text-neutral-500"
                  >
                    {quotas ? formatNumQueries(quotas[model]) : ''}
                  </p>
                );
              })}
            </Flashing> */}
            {tierDetails.prices.length > 1 && (
              <Slider.Root
                onValueChange={([p]) => {
                  setPriceStep(p);
                }}
                className="absolute -bottom-12 flex h-5 w-full select-none items-center md:mt-2"
                defaultValue={[0]}
                value={[priceStep]}
                min={0}
                max={tierDetails.prices.length - 1}
                step={1}
                aria-label="Price"
              >
                <Slider.Track className="relative h-1 flex-grow rounded-full bg-fuchsia-900/30">
                  <Slider.Range className="absolute h-full rounded-full bg-fuchsia-900" />
                </Slider.Track>
                <Slider.Thumb className="block h-4 w-4 rounded-full bg-white" />
              </Slider.Root>
            )}
          </div>
        )}
      </div>
      <ul className="mb-4 flex w-full flex-grow flex-col gap-1">
        {tierDetails.items.map((item, i) => {
          return (
            <ListItem
              variant="discreet"
              size="sm"
              key={`pricing-${tierDetails.name}-${i}`}
            >
              {item}
            </ListItem>
          );
        })}
        {tierDetails.notes && (
          <ul className="mt-6 flex w-full flex-grow flex-col gap-1">
            {tierDetails.notes.map((note, i) => {
              return (
                <li
                  className="text-xs text-neutral-500"
                  key={`note-${note}-${i}`}
                >
                  {note}
                </li>
              );
            })}
          </ul>
        )}
      </ul>
      <div className="w-full">
        <Button
          loading={loading}
          disabled={isCurrentPlan}
          buttonSize="sm"
          className="w-full"
          variant="plain"
          href={ctaHref}
          onClick={async () => {
            if (!team || ctaHref) {
              return;
            }
            try {
              setLoading(true);

              if (isFree) {
                const res = await cancelSubscription(team.id);
                if (res.status === 200) {
                  await mutateTeam();
                  toast.success('Downgraded to free.');
                } else {
                  toast.error(res.statusText);
                }
              } else {
                const { sessionId } = await fetch(
                  '/api/subscriptions/create-checkout-session',
                  {
                    method: 'POST',
                    body: JSON.stringify({
                      redirect: router.asPath,
                      teamId: team.id,
                      priceId:
                        priceStep > -1
                          ? tierDetails.prices?.[priceStep].price?.[
                              showAnnual || !hasMonthlyOption
                                ? 'yearly'
                                : 'monthly'
                            ]?.priceIds[env]
                          : undefined,
                    }),
                    headers: {
                      'Content-Type': 'application/json',
                      accept: 'application/json',
                    },
                  },
                ).then((res) => res.json());
                const stripe = await getStripe();
                stripe?.redirectToCheckout({ sessionId });
                await mutateTeam();
              }
            } catch (e) {
              toast.error((e as Error)?.message);
              return console.error((e as Error)?.message);
            } finally {
              setLoading(false);
            }
          }}
        >
          {buttonLabel}
        </Button>
      </div>
    </div>
  );
};

const Team = () => {
  const { team } = useTeam();
  const [model, setModel] = useState<PricedModel>('gpt-3.5-turbo');
  const [hasSwitched, setHasSwitched] = useState(false);

  let tierName: string | undefined;
  if (team?.is_enterprise_plan) {
    tierName = 'Enterprise';
  } else if (team?.stripe_price_id) {
    tierName = getTierDetailsFromPriceId(team.stripe_price_id)?.name;
  } else {
    tierName = 'Hobby';
  }

  return (
    <TeamSettingsLayout
      title="Plans"
      SubHeading={() => {
        if (!team) {
          return <></>;
        }
        return (
          <p className="mb-6 text-sm text-neutral-500">
            You are currently on the{' '}
            <span className="font-semibold text-neutral-400">{tierName}</span>{' '}
            plan.
          </p>
        );
      }}
    >
      {team && (
        <>
          <div className="relative -mt-4 mb-8">
            {/* Transparent border-b to match baseline height of Segment */}
            {/* <div className="flex items-center gap-2">
              <p className="border-b border-transparent text-xs text-neutral-500">
                Show quotas with
              </p>
              <Segment
                items={['Chat', 'GPT-4', 'BYO']}
                variant="text"
                size="xs"
                selected={model === 'gpt-4' ? 1 : model === 'byo' ? 2 : 0}
                id="billing-period"
                onChange={(i) => {
                  setHasSwitched(true);
                  setModel(
                    i === 0 ? 'gpt-3.5-turbo' : i === 1 ? 'gpt-4' : 'byo',
                  );
                }}
              />
            </div> */}
            <p
              className={cn(
                'absolute inset-x-0 -bottom-7 mt-4 transform text-xs text-neutral-600 transition duration-500',
                {
                  'translate-y-0 opacity-100': model === 'byo',
                  'translate-y-1 opacity-0': model !== 'byo',
                },
              )}
            >
              * BYO: Bring your own API key
            </p>
          </div>
          <div className="-ml-8 grid w-[calc(100%+64px)] grid-cols-1 gap-4 sm:grid-cols-3">
            <PricingCard
              tier="hobby"
              model={model}
              currentPriceId={team?.stripe_price_id || undefined}
              isEnterprisePlan={!!team?.is_enterprise_plan}
              customPrice="Free"
            />
            <PricingCard
              tier="pro"
              isStandard
              model={model}
              currentPriceId={team?.stripe_price_id || undefined}
              isEnterprisePlan={!!team?.is_enterprise_plan}
            />
            <PricingCard
              tier="enterprise"
              model={model}
              currentPriceId={team?.stripe_price_id || undefined}
              isEnterprisePlan={!!team?.is_enterprise_plan}
              customPrice="Custom"
              cta="Contact Sales"
              ctaHref={`mailto:${process.env.NEXT_PUBLIC_SALES_EMAIL!}`}
            />
          </div>
          <p
            className={cn(
              'transfrom mt-8 text-center text-sm text-neutral-600 transition duration-500',
              {
                'translate-y-0 opacity-100': hasSwitched,
                'translate-y-1 opacity-0': !hasSwitched,
              },
            )}
          >
            * When switching models during a billing cycle, quotas will be
            adjusted pro-rata.
          </p>
        </>
      )}
    </TeamSettingsLayout>
  );
};

export default Team;
